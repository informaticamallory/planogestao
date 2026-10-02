"""Painel de Gamificação & Eficiência.

Resumo, ranking e pódio saem do mesmo cálculo (`_classificacao`) sobre o extrato de pontos,
então os números batem entre si para qualquer combinação de filtros.

- Período: data da conclusão (ocorrido_em do lançamento).
- Área/setor: área e setor atuais do colaborador.
- Equipe: equipes cadastradas (módulo Equipes); entram só os membros da equipe.
- Tendência: pontos do período comparados com o período imediatamente anterior de mesma duração.
"""

from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models import Area, Equipe, EquipeMembro, GamificacaoLancamento, GamificacaoRegra, GatilhoPontuacao, PlanoDeAcao, Setor, Usuario
from app.models.enums import STATUS_PLANO_EM_EXECUCAO
from app.services.configuracoes import valor_inteiro
from app.services.periodo import Periodo


@dataclass(frozen=True)
class FiltrosGamificacao:
    periodo: Periodo
    area_id: int | None = None
    setor_id: int | None = None
    equipe_id: int | None = None  # equipe cadastrada


@dataclass(frozen=True)
class LinhaRanking:
    posicao: int
    usuario_id: int
    nome: str
    avatar_url: str | None
    area: str | None
    setor: str | None
    pontos: int
    planos_fechados: int
    acoes_no_prazo: int
    acoes_atrasadas: int
    desempenho: float | None  # % no prazo das ações entregues
    pontos_periodo_anterior: int
    variacao: int
    tendencia: str  # subiu | caiu | estavel | novo


def periodo_anterior(p: Periodo) -> Periodo:
    dias = (p.fim - p.inicio).days + 1
    return Periodo(p.tipo, p.inicio - timedelta(days=dias), p.inicio - timedelta(days=1))


def _percentual(parte: int, total: int) -> float | None:
    return round(parte * 100 / total, 1) if total else None


def _membros(equipe_id: int):
    return select(EquipeMembro.usuario_id).where(EquipeMembro.equipe_id == equipe_id)


class GamificacaoService:
    def __init__(self, db: Session):
        self.db = db

    # ---- base ----------------------------------------------------------------------------

    def _somas(self, periodo: Periodo, f: FiltrosGamificacao):
        L = GamificacaoLancamento

        def conta(gatilho: GatilhoPontuacao):
            return func.coalesce(func.sum(case((L.gatilho == gatilho, 1), else_=0)), 0)

        consulta = (
            select(
                L.usuario_id,
                func.coalesce(func.sum(L.pontos), 0).label("pontos"),
                conta(GatilhoPontuacao.PLANO_CONCLUIDO).label("planos"),
                conta(GatilhoPontuacao.ACAO_NO_PRAZO).label("no_prazo"),
                conta(GatilhoPontuacao.ACAO_FORA_DO_PRAZO).label("atrasadas"),
            )
            .join(Usuario, Usuario.id == L.usuario_id)
            .where(L.ocorrido_em >= periodo.inicio_utc, L.ocorrido_em < periodo.fim_exclusivo_utc)
            .group_by(L.usuario_id)
        )
        if f.area_id is not None:
            consulta = consulta.where(Usuario.area_id == f.area_id)
        if f.setor_id is not None:
            consulta = consulta.where(Usuario.setor_id == f.setor_id)
        if f.equipe_id is not None:
            consulta = consulta.where(L.usuario_id.in_(_membros(f.equipe_id)))
        return {r.usuario_id: r for r in self.db.execute(consulta)}

    def _classificacao(self, f: FiltrosGamificacao) -> list[LinhaRanking]:
        atuais = self._somas(f.periodo, f)
        if not atuais:
            return []
        anteriores = self._somas(periodo_anterior(f.periodo), f)
        usuarios = {
            u.id: u
            for u in self.db.scalars(select(Usuario).where(Usuario.id.in_(atuais.keys())))
        }

        linhas = []
        for uid, r in atuais.items():
            u = usuarios[uid]
            pontos, no_prazo, atrasadas = int(r.pontos), int(r.no_prazo), int(r.atrasadas)
            anterior = int(anteriores[uid].pontos) if uid in anteriores else 0
            variacao = pontos - anterior
            tendencia = "novo" if uid not in anteriores else "subiu" if variacao > 0 else "caiu" if variacao < 0 else "estavel"
            linhas.append(
                dict(
                    usuario_id=uid, nome=u.nome, avatar_url=u.avatar_url,
                    area=u.area.nome if u.area else None, setor=u.setor.nome if u.setor else None,
                    pontos=pontos, planos_fechados=int(r.planos), acoes_no_prazo=no_prazo, acoes_atrasadas=atrasadas,
                    desempenho=_percentual(no_prazo, no_prazo + atrasadas),
                    pontos_periodo_anterior=anterior, variacao=variacao, tendencia=tendencia,
                )
            )
        # Desempate: pontos, % no prazo, entregas no prazo, nome. Posições são sequenciais (sem empate).
        linhas.sort(key=lambda l: (-l["pontos"], -(l["desempenho"] or -1), -l["acoes_no_prazo"], l["nome"], l["usuario_id"]))
        return [LinhaRanking(posicao=i, **l) for i, l in enumerate(linhas, start=1)]

    # ---- endpoints --------------------------------------------------------------------------

    def resumo(self, f: FiltrosGamificacao) -> dict:
        ranking = self._classificacao(f)
        no_prazo = sum(l.acoes_no_prazo for l in ranking)
        concluidas = no_prazo + sum(l.acoes_atrasadas for l in ranking)

        # Planos ativos é uma foto de agora (não depende do período): pela área/setor do plano e,
        # com equipe, pelos planos cujo responsável é membro.
        ativos = select(func.count(PlanoDeAcao.id)).where(
            PlanoDeAcao.status.in_(STATUS_PLANO_EM_EXECUCAO), PlanoDeAcao.arquivado_em.is_(None)
        )
        if f.area_id is not None:
            ativos = ativos.where(PlanoDeAcao.area_id == f.area_id)
        if f.setor_id is not None:
            ativos = ativos.where(PlanoDeAcao.setor_id == f.setor_id)
        if f.equipe_id is not None:
            ativos = ativos.where(PlanoDeAcao.responsavel_id.in_(_membros(f.equipe_id)))

        anterior = periodo_anterior(f.periodo)
        return dict(
            periodo_inicio=f.periodo.inicio,
            periodo_fim=f.periodo.fim,
            periodo_anterior_inicio=anterior.inicio,
            periodo_anterior_fim=anterior.fim,
            colaboradores=len(ranking),
            planos_ativos=self.db.scalar(ativos) or 0,
            planos_concluidos=sum(l.planos_fechados for l in ranking),
            acoes_concluidas=concluidas,
            acoes_no_prazo=no_prazo,
            percentual_no_prazo=_percentual(no_prazo, concluidas),
            pontos_distribuidos=sum(l.pontos for l in ranking),
        )

    def ranking(self, f: FiltrosGamificacao, page: int, page_size: int) -> dict:
        linhas = self._classificacao(f)
        inicio = (page - 1) * page_size
        return dict(items=linhas[inicio : inicio + page_size], total=len(linhas), page=page, page_size=page_size)

    def top3(self, f: FiltrosGamificacao) -> dict:
        pontuaram = [l for l in self._classificacao(f) if l.pontos > 0]
        minimo = valor_inteiro("gamificacao_minimo_podio")
        suficiente = len(pontuaram) >= minimo
        return dict(suficiente=suficiente, minimo=minimo, colaboradores_pontuando=len(pontuaram),
                    items=pontuaram[:3] if suficiente else [])

    def regras(self) -> list[GamificacaoRegra]:
        return list(self.db.scalars(select(GamificacaoRegra).order_by(GamificacaoRegra.ordem, GamificacaoRegra.id)))

    def opcoes(self) -> dict:
        areas = self.db.scalars(select(Area).where(Area.ativo).order_by(Area.nome))
        setores = self.db.scalars(select(Setor).where(Setor.ativo).order_by(Setor.nome))
        equipes = self.db.scalars(select(Equipe).where(Equipe.ativo).order_by(Equipe.nome))
        return dict(
            areas=[{"id": a.id, "nome": a.nome} for a in areas],
            setores=[{"id": s.id, "nome": s.nome, "area_id": s.area_id} for s in setores],
            equipes=[{"id": e.id, "nome": e.nome, "area_id": e.area_id} for e in equipes],
        )
