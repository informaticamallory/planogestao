"""Painel de Gamificação & Eficiência, por período de apuração.

Uma fonte só: `resultado(periodo)` devolve os lançamentos válidos do período (do extrato, se o período
está aberto/planejado; da fotografia, se está encerrado). Ranking, pódio, resumo, detalhamento e o
relatório de auditoria saem dessas mesmas linhas — por isso os totais coincidem.

- Período: data efetiva da conclusão, do início do 1º ao fim do último dia (America/Sao_Paulo).
- Rankings separados: Gestores (planos concluídos) e Executores (ações no prazo / fora do prazo).
- Empate: mesma pontuação = mesma colocação (1º, 1º, 3º). Não há critério de desempate; prêmio de
  colocação disputada por empatados fica pendente de definição.
- Área/setor/equipe só filtram as linhas exibidas: colocação e prêmio são os da classificação geral.
  Equipe filtra pessoas (participantes) com a pontuação geral delas: participar ou coordenar não gera pontos,
  e cada pessoa aparece uma vez, mesmo que esteja em várias equipes.
- Tendência: pontos do período de apuração anterior (o cadastrado imediatamente antes).
"""

from collections import defaultdict
from dataclasses import asdict, dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.tempo import hoje_local, inicio_do_dia_utc
from app.models import Acao, Area, Equipe, EquipeMembro, GamificacaoLancamento, GamificacaoRegra, PlanoDeAcao, Setor, Usuario
from app.models.enums import STATUS_PLANO_EM_EXECUCAO, ReferenciaNotificacao
from app.models.gamificacao import (
    CategoriaPontuacao,
    GamificacaoFotografia,
    GamificacaoPeriodo,
    GatilhoPontuacao,
    SituacaoLancamento,
    SituacaoPeriodo,
)
from app.services.configuracoes import valor_inteiro

# Quantos colaboradores o pódio mostra (Top 5).
TAMANHO_PODIO = 5

CLASSIFICACAO_ROTULO = {
    GatilhoPontuacao.PLANO_CONCLUIDO.value: "Plano concluído",
    GatilhoPontuacao.ACAO_NO_PRAZO.value: "Ação dentro do prazo",
    GatilhoPontuacao.ACAO_FORA_DO_PRAZO.value: "Ação fora do prazo",
}


class PeriodoNaoEncontrado(Exception):
    pass


@dataclass(frozen=True)
class FiltrosGamificacao:
    periodo_id: int | None = None
    area_id: int | None = None
    setor_id: int | None = None
    equipe_id: int | None = None  # equipe cadastrada


@dataclass(frozen=True)
class LinhaPontuacao:
    """Um lançamento válido: a unidade do ranking e do relatório de auditoria."""

    lancamento_id: int
    usuario_id: int
    participante: str
    categoria: str
    classificacao: str  # gatilho: plano_concluido | acao_no_prazo | acao_fora_do_prazo
    pontos: int
    regra: str
    plano_id: int
    plano_codigo: str | None
    plano_nome: str | None
    acao_id: int | None
    acao_codigo: str | None
    acao_descricao: str | None
    concluido_em: datetime  # UTC naive
    prazo: date | None
    origem: str
    lancado_em: datetime

    def para_json(self) -> dict:
        d = asdict(self)
        d["concluido_em"] = self.concluido_em.isoformat()
        d["lancado_em"] = self.lancado_em.isoformat()
        d["prazo"] = self.prazo.isoformat() if self.prazo else None
        return d

    @classmethod
    def de_json(cls, d: dict) -> "LinhaPontuacao":
        return cls(**{
            **d,
            "concluido_em": datetime.fromisoformat(d["concluido_em"]),
            "lancado_em": datetime.fromisoformat(d["lancado_em"]),
            "prazo": date.fromisoformat(d["prazo"]) if d.get("prazo") else None,
        })


@dataclass(frozen=True)
class Participante:
    usuario_id: int
    nome: str
    avatar_url: str | None
    area_id: int | None
    area: str | None
    setor_id: int | None
    setor: str | None


@dataclass(frozen=True)
class Premio:
    categoria: str
    colocacao: int
    nome: str
    descricao: str | None
    valor: Decimal | None


@dataclass
class Resultado:
    periodo: GamificacaoPeriodo
    encerrado: bool
    linhas: list[LinhaPontuacao]
    participantes: dict[int, Participante]
    premios: list[Premio]
    fotografia_em: datetime | None = None


@dataclass
class Colocado:
    posicao: int
    empatado: bool
    usuario_id: int
    nome: str
    avatar_url: str | None
    area: str | None
    setor: str | None
    pontos: int
    planos_concluidos: int
    acoes_no_prazo: int
    acoes_fora_prazo: int
    desempenho: float | None  # % no prazo das ações entregues (executor)
    premio: Premio | None
    premio_pendente: bool  # empate disputando colocação premiada
    pontos_periodo_anterior: int = 0
    variacao: int = 0
    tendencia: str = "novo"  # subiu | caiu | estavel | novo
    colocacoes_disputadas: list[int] = field(default_factory=list)


def _percentual(parte: int, total: int) -> float | None:
    return round(parte * 100 / total, 1) if total else None


def janela_utc(p: GamificacaoPeriodo) -> tuple[datetime, datetime]:
    """[início do 1º dia, início do dia seguinte ao último) em UTC naive."""
    return inicio_do_dia_utc(p.data_inicio), inicio_do_dia_utc(p.data_fim + timedelta(days=1))


def classificar(linhas: list[LinhaPontuacao], participantes: dict[int, Participante], premios: list[Premio],
                categoria: CategoriaPontuacao) -> list[Colocado]:
    """Classificação de uma categoria. Mesma pontuação → mesma colocação (1º, 1º, 3º), sem desempate."""
    somas: dict[int, dict] = defaultdict(lambda: {"pontos": 0, "planos": 0, "no_prazo": 0, "fora": 0})
    for l in linhas:
        if l.categoria != categoria.value:
            continue
        s = somas[l.usuario_id]
        s["pontos"] += l.pontos
        s["planos"] += l.classificacao == GatilhoPontuacao.PLANO_CONCLUIDO.value
        s["no_prazo"] += l.classificacao == GatilhoPontuacao.ACAO_NO_PRAZO.value
        s["fora"] += l.classificacao == GatilhoPontuacao.ACAO_FORA_DO_PRAZO.value
    premio_da = {p.colocacao: p for p in premios if p.categoria == categoria.value}

    # A ordem entre empatados é só de exibição (nome); a colocação é a mesma.
    ordem = sorted(somas, key=lambda uid: (-somas[uid]["pontos"], participantes[uid].nome.casefold(), uid))
    tamanho_grupo: dict[int, int] = defaultdict(int)
    for uid in ordem:
        tamanho_grupo[somas[uid]["pontos"]] += 1

    colocados: list[Colocado] = []
    posicao = 0
    for i, uid in enumerate(ordem):
        s, p = somas[uid], participantes[uid]
        if i == 0 or s["pontos"] != somas[ordem[i - 1]]["pontos"]:
            posicao = i + 1
        k = tamanho_grupo[s["pontos"]]
        disputadas = [c for c in range(posicao, posicao + k) if c in premio_da] if k > 1 else []
        colocados.append(Colocado(
            posicao=posicao, empatado=k > 1, usuario_id=uid, nome=p.nome, avatar_url=p.avatar_url, area=p.area, setor=p.setor,
            pontos=s["pontos"], planos_concluidos=s["planos"], acoes_no_prazo=s["no_prazo"], acoes_fora_prazo=s["fora"],
            desempenho=_percentual(s["no_prazo"], s["no_prazo"] + s["fora"]) if categoria == CategoriaPontuacao.EXECUTOR else None,
            premio=premio_da.get(posicao) if k == 1 else None,
            premio_pendente=bool(disputadas), colocacoes_disputadas=disputadas,
        ))
    return colocados


class GamificacaoService:
    def __init__(self, db: Session):
        self.db = db

    # ---- períodos --------------------------------------------------------------------------

    def periodos(self) -> list[GamificacaoPeriodo]:
        return list(self.db.scalars(select(GamificacaoPeriodo).order_by(GamificacaoPeriodo.data_inicio.desc())))

    def periodo_padrao(self) -> GamificacaoPeriodo | None:
        """O que contém hoje; senão o mais recente já iniciado; senão o primeiro planejado."""
        hoje = hoje_local()
        P = GamificacaoPeriodo
        return (
            self.db.scalar(select(P).where(P.data_inicio <= hoje, P.data_fim >= hoje))
            or self.db.scalar(select(P).where(P.data_inicio <= hoje).order_by(P.data_inicio.desc()).limit(1))
            or self.db.scalar(select(P).order_by(P.data_inicio).limit(1))
        )

    def obter_periodo(self, periodo_id: int | None) -> GamificacaoPeriodo:
        periodo = self.db.get(GamificacaoPeriodo, periodo_id) if periodo_id is not None else self.periodo_padrao()
        if periodo is None:
            raise PeriodoNaoEncontrado
        return periodo

    def periodo_anterior(self, p: GamificacaoPeriodo) -> GamificacaoPeriodo | None:
        P = GamificacaoPeriodo
        return self.db.scalar(select(P).where(P.data_fim < p.data_inicio).order_by(P.data_fim.desc()).limit(1))

    def fotografia_vigente(self, periodo_id: int) -> GamificacaoFotografia | None:
        F = GamificacaoFotografia
        return self.db.scalar(
            select(F).where(F.periodo_id == periodo_id, F.substituida_em.is_(None)).order_by(F.id.desc()).limit(1)
        )

    # ---- resultado (fonte única) ------------------------------------------------------------

    def linhas_ao_vivo(self, periodo: GamificacaoPeriodo) -> list[LinhaPontuacao]:
        L = GamificacaoLancamento
        inicio, fim = janela_utc(periodo)
        lancamentos = list(self.db.scalars(
            select(L).where(L.situacao == SituacaoLancamento.VALIDO, L.ocorrido_em >= inicio, L.ocorrido_em < fim).order_by(L.ocorrido_em, L.id)
        ))
        planos = {p.id: p for p in self.db.scalars(select(PlanoDeAcao).where(PlanoDeAcao.id.in_({l.plano_id for l in lancamentos})))}
        ids_acoes = {l.referencia_id for l in lancamentos if l.referencia_tipo == ReferenciaNotificacao.ACAO}
        acoes = {a.id: a for a in self.db.scalars(select(Acao).where(Acao.id.in_(ids_acoes)))} if ids_acoes else {}
        usuarios = {u.id: u for u in self.db.scalars(select(Usuario).where(Usuario.id.in_({l.usuario_id for l in lancamentos})))}
        linhas = []
        for l in lancamentos:
            plano, acao = planos.get(l.plano_id), acoes.get(l.referencia_id) if l.referencia_tipo == ReferenciaNotificacao.ACAO else None
            linhas.append(LinhaPontuacao(
                lancamento_id=l.id, usuario_id=l.usuario_id, participante=usuarios[l.usuario_id].nome,
                categoria=l.categoria.value, classificacao=l.gatilho.value, pontos=l.pontos, regra=l.regra_nome,
                plano_id=l.plano_id, plano_codigo=plano.codigo if plano else None, plano_nome=plano.nome if plano else None,
                acao_id=l.referencia_id if l.referencia_tipo == ReferenciaNotificacao.ACAO else None,
                acao_codigo=acao.numero_exibicao if acao else None, acao_descricao=acao.descricao if acao else None,
                concluido_em=l.ocorrido_em, prazo=l.prazo_considerado, origem=l.origem.value, lancado_em=l.criado_em,
            ))
        return linhas

    def participantes(self, ids: set[int]) -> dict[int, Participante]:
        return {
            u.id: Participante(u.id, u.nome, u.avatar_url, u.area_id, u.area.nome if u.area else None, u.setor_id,
                               u.setor.nome if u.setor else None)
            for u in self.db.scalars(select(Usuario).where(Usuario.id.in_(ids)))
        } if ids else {}

    @staticmethod
    def premios_de(periodo: GamificacaoPeriodo) -> list[Premio]:
        return [Premio(p.categoria.value, p.colocacao, p.nome, p.descricao, p.valor) for p in periodo.premios]

    def resultado(self, periodo: GamificacaoPeriodo) -> Resultado:
        if periodo.situacao == SituacaoPeriodo.ENCERRADO and (foto := self.fotografia_vigente(periodo.id)) is not None:
            d = foto.dados
            return Resultado(
                periodo=periodo, encerrado=True,
                linhas=[LinhaPontuacao.de_json(x) for x in d["lancamentos"]],
                participantes={int(k): Participante(**v) for k, v in d["participantes"].items()},
                premios=[Premio(p["categoria"], p["colocacao"], p["nome"], p.get("descricao"),
                                Decimal(p["valor"]) if p.get("valor") is not None else None) for p in d["premios"]],
                fotografia_em=foto.criado_em,
            )
        linhas = self.linhas_ao_vivo(periodo)
        return Resultado(periodo, False, linhas, self.participantes({l.usuario_id for l in linhas}), self.premios_de(periodo))

    # ---- painel ---------------------------------------------------------------------------

    def _filtro_usuarios(self, f: FiltrosGamificacao, r: Resultado):
        membros = (
            set(self.db.scalars(select(EquipeMembro.usuario_id).where(EquipeMembro.equipe_id == f.equipe_id)))
            if f.equipe_id is not None else None
        )

        def passa(uid: int) -> bool:
            p = r.participantes[uid]
            return ((f.area_id is None or p.area_id == f.area_id) and (f.setor_id is None or p.setor_id == f.setor_id)
                    and (membros is None or uid in membros))

        return passa

    def classificacao(self, f: FiltrosGamificacao, categoria: CategoriaPontuacao) -> tuple[Resultado, list[Colocado]]:
        periodo = self.obter_periodo(f.periodo_id)
        r = self.resultado(periodo)
        colocados = classificar(r.linhas, r.participantes, r.premios, categoria)
        anterior = self.periodo_anterior(periodo)
        pontos_antes: dict[int, int] = defaultdict(int)
        if anterior is not None:
            for l in self.resultado(anterior).linhas:
                if l.categoria == categoria.value:
                    pontos_antes[l.usuario_id] += l.pontos
        for c in colocados:
            c.pontos_periodo_anterior = pontos_antes.get(c.usuario_id, 0)
            c.variacao = c.pontos - c.pontos_periodo_anterior
            c.tendencia = ("novo" if c.usuario_id not in pontos_antes else
                           "subiu" if c.variacao > 0 else "caiu" if c.variacao < 0 else "estavel")
        passa = self._filtro_usuarios(f, r)
        return r, [c for c in colocados if passa(c.usuario_id)]

    def ranking(self, f: FiltrosGamificacao, categoria: CategoriaPontuacao, page: int, page_size: int) -> dict:
        _, linhas = self.classificacao(f, categoria)
        inicio = (page - 1) * page_size
        return dict(items=linhas[inicio: inicio + page_size], total=len(linhas), page=page, page_size=page_size)

    def podio(self, f: FiltrosGamificacao, categoria: CategoriaPontuacao) -> dict:
        """Top TAMANHO_PODIO (pela colocação; empatados no limite entram juntos), só com dados suficientes."""
        _, linhas = self.classificacao(f, categoria)
        pontuaram = [l for l in linhas if l.pontos > 0]
        minimo = valor_inteiro("gamificacao_minimo_podio")
        suficiente = len(pontuaram) >= minimo
        return dict(suficiente=suficiente, minimo=minimo, colaboradores_pontuando=len(pontuaram),
                    items=[l for l in pontuaram if l.posicao <= TAMANHO_PODIO] if suficiente else [])

    def resumo(self, f: FiltrosGamificacao) -> dict:
        periodo = self.obter_periodo(f.periodo_id)
        r = self.resultado(periodo)
        passa = self._filtro_usuarios(f, r)
        linhas = [l for l in r.linhas if passa(l.usuario_id)]
        conta = lambda gatilho: sum(l.classificacao == gatilho.value for l in linhas)
        no_prazo, fora = conta(GatilhoPontuacao.ACAO_NO_PRAZO), conta(GatilhoPontuacao.ACAO_FORA_DO_PRAZO)

        # Planos ativos é uma foto de agora (não depende do período).
        ativos = select(func.count(PlanoDeAcao.id)).where(
            PlanoDeAcao.status.in_(STATUS_PLANO_EM_EXECUCAO), PlanoDeAcao.arquivado_em.is_(None)
        )
        if f.area_id is not None:
            ativos = ativos.where(PlanoDeAcao.area_id == f.area_id)
        if f.setor_id is not None:
            ativos = ativos.where(PlanoDeAcao.setor_id == f.setor_id)
        if f.equipe_id is not None:
            # O plano da equipe (não os planos de cada participante).
            ativos = ativos.where(PlanoDeAcao.id.in_(select(Equipe.plano_id).where(Equipe.id == f.equipe_id)))
        por_categoria = lambda c: {l.usuario_id for l in linhas if l.categoria == c.value}
        return dict(
            periodo_id=periodo.id, periodo_nome=periodo.nome, periodo_inicio=periodo.data_inicio, periodo_fim=periodo.data_fim,
            situacao=periodo.situacao.value, encerrado_em=r.fotografia_em,
            gestores=len(por_categoria(CategoriaPontuacao.GESTOR)), executores=len(por_categoria(CategoriaPontuacao.EXECUTOR)),
            colaboradores=len({l.usuario_id for l in linhas}),
            planos_ativos=self.db.scalar(ativos) or 0,
            planos_concluidos=conta(GatilhoPontuacao.PLANO_CONCLUIDO),
            acoes_concluidas=no_prazo + fora, acoes_no_prazo=no_prazo, acoes_fora_prazo=fora,
            percentual_no_prazo=_percentual(no_prazo, no_prazo + fora),
            pontos_distribuidos=sum(l.pontos for l in linhas),
            pontos_gestores=sum(l.pontos for l in linhas if l.categoria == CategoriaPontuacao.GESTOR.value),
            pontos_executores=sum(l.pontos for l in linhas if l.categoria == CategoriaPontuacao.EXECUTOR.value),
        )

    def itens_do_participante(self, periodo_id: int | None, usuario_id: int, categoria: CategoriaPontuacao | None) -> dict:
        periodo = self.obter_periodo(periodo_id)
        r = self.resultado(periodo)
        linhas = [l for l in r.linhas if l.usuario_id == usuario_id and (categoria is None or l.categoria == categoria.value)]
        p = r.participantes.get(usuario_id)
        return dict(periodo_id=periodo.id, usuario_id=usuario_id, nome=p.nome if p else None,
                    total=sum(l.pontos for l in linhas), items=linhas)

    def regras(self) -> list[GamificacaoRegra]:
        return list(self.db.scalars(select(GamificacaoRegra).order_by(GamificacaoRegra.ordem, GamificacaoRegra.id)))

    def opcoes(self) -> dict:
        areas = self.db.scalars(select(Area).where(Area.ativo).order_by(Area.nome))
        setores = self.db.scalars(select(Setor).where(Setor.ativo).order_by(Setor.nome))
        equipes = self.db.scalars(select(Equipe).where(Equipe.ativo).order_by(Equipe.nome))
        return dict(
            areas=[{"id": a.id, "nome": a.nome} for a in areas],
            setores=[{"id": s.id, "nome": s.nome, "area_id": s.area_id} for s in setores],
            # O nome se repete entre planos: a opção leva o código do plano.
            equipes=[{"id": e.id, "nome": f"{e.nome} · {e.plano.codigo}" if e.plano else e.nome,
                      "area_id": e.plano.area_id if e.plano else e.area_id} for e in equipes],
        )
