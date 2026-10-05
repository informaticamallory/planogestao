"""Apuração da gamificação: períodos, prêmios, recálculo, regularização, correção, encerramento e auditoria.

Tudo que muda pontuação ou período é explícito e fica em gamificacao_auditoria (autor, data, justificativa).
Período ENCERRADO é imutável: não recebe lançamentos, recálculo, correção nem regularização; para mudar,
é preciso reabri-lo (permissão própria e justificativa).
"""

import calendar
from dataclasses import dataclass, field
from datetime import date, timedelta

from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import utcnow
from app.core.tempo import data_local, hoje_local, inicio_do_dia_utc
from app.models import Acao, PlanoDeAcao, Usuario
from app.models.enums import EventoHistorico, EventoPlano, ReferenciaNotificacao, StatusAcao, StatusPlano
from app.models.gamificacao import (
    CategoriaPontuacao,
    EventoAuditoria,
    GamificacaoAuditoria,
    GamificacaoFotografia,
    GamificacaoLancamento,
    GamificacaoPeriodo,
    GamificacaoPremio,
    GamificacaoRegra,
    OrigemLancamento,
    SituacaoLancamento,
    SituacaoPeriodo,
)
from app.services.erros import Conflito, NaoEncontrado, RegraInvalida
from app.services.gamificacao_service import (
    CLASSIFICACAO_ROTULO,
    GamificacaoService,
    LinhaPontuacao,
    classificar,
    janela_utc,
)
from app.services.historico import registrar_historico, registrar_historico_plano
from app.services.pontuacao import (
    acao_pontua,
    auditar,
    lancamento_valido,
    lancar_acao,
    lancar_plano,
    periodo_encerrado_em,
    plano_pontua,
    reverter,
)

MESES = ("Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez")
MIN_JUSTIFICATIVA = 10


def nome_trimestre(ano: int, t: int) -> str:
    return f"{t + 1}º trimestre {ano} ({MESES[3 * t]}–{MESES[3 * t + 2]})"


def datas_trimestre(ano: int, t: int) -> tuple[date, date]:
    return date(ano, 3 * t + 1, 1), date(ano, 3 * t + 3, calendar.monthrange(ano, 3 * t + 3)[1])


def _justificativa(texto: str | None) -> str:
    texto = " ".join((texto or "").split())
    if len(texto) < MIN_JUSTIFICATIVA:
        raise RegraInvalida(f"Informe a justificativa (pelo menos {MIN_JUSTIFICATIVA} caracteres).")
    return texto[:500]


@dataclass
class Bloqueio:
    tipo: str  # situacao | em_andamento | empate | sem_data | recalculo
    mensagem: str


@dataclass
class Verificacao:
    pode_encerrar: bool
    bloqueios: list[Bloqueio] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)


@dataclass
class Pendencias:
    """O que o recálculo do período mudaria (sem gravar)."""

    sem_lancamento: list[Acao | PlanoDeAcao] = field(default_factory=list)
    orfaos: list[GamificacaoLancamento] = field(default_factory=list)  # válido, mas o item não está mais concluído

    @property
    def total(self) -> int:
        return len(self.sem_lancamento) + len(self.orfaos)


def rotulo_item(item: Acao | PlanoDeAcao) -> str:
    if isinstance(item, PlanoDeAcao):
        return f"Plano {item.codigo} — {item.nome}"
    return f"Ação {item.numero_exibicao} do plano {item.plano.codigo} — {item.descricao[:80]}"


class ApuracaoService:
    def __init__(self, db: Session, autor: Usuario):
        self.db = db
        self.autor = autor
        self.painel = GamificacaoService(db)

    # ---- períodos --------------------------------------------------------------------------

    def _periodo(self, periodo_id: int) -> GamificacaoPeriodo:
        periodo = self.db.get(GamificacaoPeriodo, periodo_id)
        if periodo is None:
            raise NaoEncontrado("Período de apuração não encontrado.")
        return periodo

    def _exigir_nao_encerrado(self, periodo: GamificacaoPeriodo, acao: str) -> None:
        if periodo.situacao == SituacaoPeriodo.ENCERRADO:
            raise RegraInvalida(f"O período “{periodo.nome}” está encerrado: reabra a apuração para {acao}.")

    def _validar_datas(self, nome: str, inicio: date, fim: date, ignorar_id: int | None = None) -> None:
        if not nome.strip():
            raise RegraInvalida("Informe o nome do período.")
        if inicio > fim:
            raise RegraInvalida("A data inicial deve ser anterior ou igual à data final.")
        P = GamificacaoPeriodo
        consulta = select(P).where(P.data_inicio <= fim, P.data_fim >= inicio)
        if ignorar_id is not None:
            consulta = consulta.where(P.id != ignorar_id)
        if (outro := self.db.scalar(consulta.limit(1))) is not None:
            raise Conflito(
                f"O período se sobrepõe a “{outro.nome}” ({outro.data_inicio:%d/%m/%Y} a {outro.data_fim:%d/%m/%Y})."
            )

    def _commit_nome(self, nome: str) -> None:
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            raise Conflito(f"Já existe um período chamado “{nome}”.") from None

    def criar_periodo(self, nome: str, ano: int, inicio: date, fim: date, situacao: SituacaoPeriodo) -> GamificacaoPeriodo:
        if situacao == SituacaoPeriodo.ENCERRADO:
            raise RegraInvalida("Um período é encerrado pela ação “Encerrar apuração”.")
        nome = " ".join(nome.split())
        self._validar_datas(nome, inicio, fim)
        periodo = GamificacaoPeriodo(nome=nome, ano=ano, data_inicio=inicio, data_fim=fim, situacao=situacao)
        self.db.add(periodo)
        self.db.flush()
        auditar(self.db, EventoAuditoria.PERIODO, f"Período “{nome}” criado ({inicio:%d/%m/%Y} a {fim:%d/%m/%Y}, {situacao.value}).",
                autor_id=self.autor.id, periodo_id=periodo.id)
        self._commit_nome(nome)
        return periodo

    def atualizar_periodo(self, periodo_id: int, nome: str, ano: int, inicio: date, fim: date, situacao: SituacaoPeriodo) -> GamificacaoPeriodo:
        periodo = self._periodo(periodo_id)
        self._exigir_nao_encerrado(periodo, "alterá-lo")
        if situacao == SituacaoPeriodo.ENCERRADO:
            raise RegraInvalida("Um período é encerrado pela ação “Encerrar apuração”.")
        nome = " ".join(nome.split())
        self._validar_datas(nome, inicio, fim, ignorar_id=periodo.id)
        antes = f"{periodo.nome}, {periodo.data_inicio:%d/%m/%Y}–{periodo.data_fim:%d/%m/%Y}, {periodo.situacao.value}"
        periodo.nome, periodo.ano, periodo.data_inicio, periodo.data_fim, periodo.situacao = nome, ano, inicio, fim, situacao
        auditar(self.db, EventoAuditoria.PERIODO,
                f"Período alterado: {antes} → {nome}, {inicio:%d/%m/%Y}–{fim:%d/%m/%Y}, {situacao.value}.",
                autor_id=self.autor.id, periodo_id=periodo.id)
        self._commit_nome(nome)
        return periodo

    def excluir_periodo(self, periodo_id: int) -> None:
        periodo = self._periodo(periodo_id)
        self._exigir_nao_encerrado(periodo, "excluí-lo")
        if self.db.scalar(select(GamificacaoFotografia.id).where(GamificacaoFotografia.periodo_id == periodo.id).limit(1)):
            raise Conflito("Este período já foi encerrado alguma vez: o histórico de resultados impede a exclusão.")
        auditar(self.db, EventoAuditoria.PERIODO,
                f"Período “{periodo.nome}” ({periodo.data_inicio:%d/%m/%Y}–{periodo.data_fim:%d/%m/%Y}) excluído.",
                autor_id=self.autor.id)
        self.db.delete(periodo)
        self.db.commit()

    def gerar_trimestres(self, ano: int) -> dict:
        """Os 4 trimestres civis do ano. Já existentes (mesmas datas) são mantidos; sobreposições são recusadas."""
        if not 2000 <= ano <= 2100:
            raise RegraInvalida("Ano inválido.")
        hoje = hoje_local()
        criados, existentes, conflitos = [], [], []
        P = GamificacaoPeriodo
        for t in range(4):
            inicio, fim = datas_trimestre(ano, t)
            nome = nome_trimestre(ano, t)
            if self.db.scalar(select(P.id).where(P.data_inicio == inicio, P.data_fim == fim)):
                existentes.append(nome)
                continue
            outro = self.db.scalar(select(P).where(P.data_inicio <= fim, P.data_fim >= inicio).limit(1))
            if outro is not None or self.db.scalar(select(P.id).where(P.nome == nome)):
                conflitos.append(f"{nome}: sobrepõe “{outro.nome}”." if outro else f"{nome}: nome já usado.")
                continue
            situacao = SituacaoPeriodo.ABERTO if inicio <= hoje else SituacaoPeriodo.PLANEJADO
            periodo = P(nome=nome, ano=ano, data_inicio=inicio, data_fim=fim, situacao=situacao)
            self.db.add(periodo)
            self.db.flush()
            auditar(self.db, EventoAuditoria.PERIODO, f"Período “{nome}” gerado ({situacao.value}).",
                    autor_id=self.autor.id, periodo_id=periodo.id)
            criados.append(nome)
        self.db.commit()
        return dict(criados=criados, existentes=existentes, conflitos=conflitos)

    def definir_premios(self, periodo_id: int, premios: list[dict]) -> GamificacaoPeriodo:
        """Substitui os prêmios do período. Uma colocação por categoria; quantidade e valores livres."""
        periodo = self._periodo(periodo_id)
        self._exigir_nao_encerrado(periodo, "alterar os prêmios")
        vistos: set[tuple[str, int]] = set()
        for p in premios:
            chave = (CategoriaPontuacao(p["categoria"]).value, int(p["colocacao"]))
            if chave[1] < 1:
                raise RegraInvalida("A colocação deve ser 1 ou maior.")
            if chave in vistos:
                raise Conflito(f"Prêmio repetido: {chave[0]} — {chave[1]}º lugar.")
            if not str(p.get("nome") or "").strip():
                raise RegraInvalida(f"Informe o nome do prêmio do {chave[1]}º lugar ({chave[0]}).")
            vistos.add(chave)
        periodo.premios.clear()
        self.db.flush()
        for p in premios:
            periodo.premios.append(GamificacaoPremio(
                categoria=CategoriaPontuacao(p["categoria"]), colocacao=int(p["colocacao"]), nome=str(p["nome"]).strip(),
                descricao=(str(p.get("descricao") or "").strip() or None), valor=p.get("valor"),
            ))
        resumo = "; ".join(f"{p['categoria']} {p['colocacao']}º: {p['nome']}" for p in premios) or "nenhum"
        auditar(self.db, EventoAuditoria.PREMIOS, f"Prêmios definidos: {resumo}."[:1000], autor_id=self.autor.id, periodo_id=periodo.id)
        self.db.commit()
        self.db.refresh(periodo)
        return periodo

    # ---- inconsistências e pendências ---------------------------------------------------------

    def inconsistencias(self) -> list[dict]:
        """Registros concluídos sem data efetiva de conclusão: não dá para saber o período deles."""
        itens: list[dict] = []
        for plano in self.db.scalars(select(PlanoDeAcao).where(
            PlanoDeAcao.status == StatusPlano.CONCLUIDO, PlanoDeAcao.concluido_em.is_(None), PlanoDeAcao.rascunho.is_(False)
        )):
            itens.append(dict(referencia_tipo="plano", referencia_id=plano.id, plano_id=plano.id, plano_codigo=plano.codigo,
                              rotulo=rotulo_item(plano), responsavel=plano.responsavel.nome, prazo=None,
                              problema="Plano concluído sem data de conclusão."))
        for acao in self.db.scalars(select(Acao).where(
            Acao.status == StatusAcao.CONCLUIDA, Acao.concluida_em.is_(None), Acao.acao_pai_id.is_(None)
        )):
            # O prazo é obrigatório no banco; se um dia faltar, a ação não é classificada (nem pontual nem atrasada).
            problema = "Ação concluída sem data de conclusão." + ("" if acao.prazo else " Também sem prazo.")
            itens.append(dict(referencia_tipo="acao", referencia_id=acao.id, plano_id=acao.plano_id, plano_codigo=acao.plano.codigo,
                              rotulo=rotulo_item(acao), responsavel=acao.responsavel.nome, prazo=acao.prazo, problema=problema))
        return itens

    def pendencias(self, periodo: GamificacaoPeriodo) -> Pendencias:
        inicio, fim = janela_utc(periodo)
        p = Pendencias()
        for acao in self.db.scalars(select(Acao).where(
            Acao.status == StatusAcao.CONCLUIDA, Acao.acao_pai_id.is_(None), Acao.concluida_em >= inicio, Acao.concluida_em < fim
        )):
            if lancamento_valido(self.db, ReferenciaNotificacao.ACAO, acao.id) is None:
                p.sem_lancamento.append(acao)
        for plano in self.db.scalars(select(PlanoDeAcao).where(
            PlanoDeAcao.status == StatusPlano.CONCLUIDO, PlanoDeAcao.rascunho.is_(False),
            PlanoDeAcao.concluido_em >= inicio, PlanoDeAcao.concluido_em < fim,
        )):
            if lancamento_valido(self.db, ReferenciaNotificacao.PLANO, plano.id) is None:
                p.sem_lancamento.append(plano)
        L = GamificacaoLancamento
        for l in self.db.scalars(select(L).where(L.situacao == SituacaoLancamento.VALIDO, L.ocorrido_em >= inicio, L.ocorrido_em < fim)):
            item = self._item(l.referencia_tipo, l.referencia_id)
            if item is None or not (acao_pontua(item) if isinstance(item, Acao) else plano_pontua(item)):
                p.orfaos.append(l)
        return p

    def divergencias(self, periodo: GamificacaoPeriodo) -> list[dict]:
        """Lançamentos válidos cujo item mudou depois (responsável, prazo, data): só informa — corrigir é explícito."""
        inicio, fim = janela_utc(periodo)
        L = GamificacaoLancamento
        saida = []
        for l in self.db.scalars(select(L).where(L.situacao == SituacaoLancamento.VALIDO, L.ocorrido_em >= inicio, L.ocorrido_em < fim)):
            item = self._item(l.referencia_tipo, l.referencia_id)
            if item is None:
                continue
            motivos = []
            if item.responsavel_id != l.usuario_id:
                motivos.append(f"responsável mudou para {item.responsavel.nome}")
            if isinstance(item, Acao) and item.prazo != l.prazo_considerado:
                motivos.append(f"prazo mudou de {l.prazo_considerado:%d/%m/%Y} para {item.prazo:%d/%m/%Y}" if l.prazo_considerado else "prazo alterado")
            concluido = item.concluida_em if isinstance(item, Acao) else item.concluido_em
            if concluido is not None and concluido != l.ocorrido_em:
                motivos.append("data de conclusão diferente da registrada")
            if motivos:
                saida.append(dict(lancamento_id=l.id, rotulo=rotulo_item(item), motivos=motivos))
        return saida

    def _item(self, tipo: ReferenciaNotificacao, ref_id: int) -> Acao | PlanoDeAcao | None:
        return self.db.get(Acao if tipo == ReferenciaNotificacao.ACAO else PlanoDeAcao, ref_id)

    # ---- recálculo, regularização e correção ----------------------------------------------------

    def recalcular(self, periodo_id: int) -> dict:
        """Concilia o extrato com as conclusões do período. Idempotente: rodar de novo não muda nada."""
        periodo = self._periodo(periodo_id)
        self._exigir_nao_encerrado(periodo, "recalcular")
        pend = self.pendencias(periodo)
        criados = revertidos = 0
        for item in pend.sem_lancamento:
            if isinstance(item, Acao):
                novo = lancar_acao(self.db, item, OrigemLancamento.RECALCULO, self.autor.id)
            else:
                novo = lancar_plano(self.db, item, OrigemLancamento.RECALCULO, self.autor.id)
            criados += novo is not None
        for l in pend.orfaos:
            reverter(self.db, l, "Recálculo: o item não está mais concluído.", self.autor.id)
            revertidos += 1
        auditar(self.db, EventoAuditoria.RECALCULO,
                f"Recálculo de “{periodo.nome}”: {criados} lançamento(s) criado(s), {revertidos} revertido(s).",
                autor_id=self.autor.id, periodo_id=periodo.id)
        self.db.commit()
        return dict(criados=criados, revertidos=revertidos)

    def regularizar(self, tipo: ReferenciaNotificacao, ref_id: int, dia: date, justificativa: str) -> dict:
        """Registro antigo concluído sem data: informa a data efetiva (nunca inventada pelo sistema)."""
        justificativa = _justificativa(justificativa)
        item = self._item(tipo, ref_id)
        if item is None:
            raise NaoEncontrado("Item não encontrado.")
        concluido = item.status == (StatusAcao.CONCLUIDA if isinstance(item, Acao) else StatusPlano.CONCLUIDO)
        data_atual = item.concluida_em if isinstance(item, Acao) else item.concluido_em
        if not concluido or data_atual is not None:
            raise RegraInvalida("Só se regulariza item concluído e sem data de conclusão.")
        if dia > hoje_local():
            raise RegraInvalida("A data de conclusão não pode estar no futuro.")
        momento = inicio_do_dia_utc(dia) + timedelta(hours=12)  # só a data é informada: meio-dia local
        if (encerrado := periodo_encerrado_em(self.db, momento)) is not None:
            raise RegraInvalida(f"A data cai no período encerrado “{encerrado.nome}”: reabra a apuração antes.")
        if isinstance(item, Acao):
            item.concluida_em = momento
            registrar_historico(self.db, item, self.autor.id, EventoHistorico.ALTERACAO, "concluida_em", None,
                                dia.strftime("%d/%m/%Y"), detalhe=f"Regularização (gamificação): {justificativa}")
            novo = lancar_acao(self.db, item, OrigemLancamento.REGULARIZACAO, self.autor.id)
        else:
            item.concluido_em = momento
            registrar_historico_plano(self.db, item, self.autor.id, EventoPlano.ALTERACAO, "concluido_em", None,
                                      dia.strftime("%d/%m/%Y"), motivo=f"Regularização: {justificativa}"[:200])
            novo = lancar_plano(self.db, item, OrigemLancamento.REGULARIZACAO, self.autor.id)
        auditar(self.db, EventoAuditoria.REGULARIZACAO,
                f"{rotulo_item(item)}: data de conclusão informada {dia:%d/%m/%Y}"
                + (f"; lançamento #{novo.id} ({novo.pontos} pts)." if novo else "; sem pontuação (sub-item ou regra)."),
                autor_id=self.autor.id, justificativa=justificativa, lancamento=novo, referencia=tipo, referencia_id=ref_id)
        self.db.commit()
        return dict(lancamento_id=novo.id if novo else None)

    def corrigir(self, lancamento_id: int, justificativa: str) -> dict:
        """Recalcula UM item pelos dados atuais (responsável, prazo, data): reverte e lança de novo."""
        justificativa = _justificativa(justificativa)
        lanc = self.db.get(GamificacaoLancamento, lancamento_id)
        if lanc is None:
            raise NaoEncontrado("Lançamento não encontrado.")
        if lanc.situacao != SituacaoLancamento.VALIDO:
            raise RegraInvalida("Este lançamento já foi revertido.")
        if (encerrado := periodo_encerrado_em(self.db, lanc.ocorrido_em)) is not None:
            raise RegraInvalida(f"O lançamento pertence ao período encerrado “{encerrado.nome}”: reabra a apuração antes.")
        item = self._item(lanc.referencia_tipo, lanc.referencia_id)
        antes = f"#{lanc.id}: {lanc.usuario.nome}, {lanc.pontos} pts ({CLASSIFICACAO_ROTULO[lanc.gatilho.value]})"
        reverter(self.db, lanc, f"Correção: {justificativa}", self.autor.id)
        novo = None
        if item is not None:
            novo = (lancar_acao if isinstance(item, Acao) else lancar_plano)(self.db, item, OrigemLancamento.CORRECAO, self.autor.id)
        depois = (f"#{novo.id}: {self.db.get(Usuario, novo.usuario_id).nome}, {novo.pontos} pts "
                  f"({CLASSIFICACAO_ROTULO[novo.gatilho.value]})") if novo else "sem nova pontuação (item não está concluído)"
        auditar(self.db, EventoAuditoria.CORRECAO, f"Correção de lançamento. Antes {antes}. Depois {depois}.",
                autor_id=self.autor.id, justificativa=justificativa, lancamento=lanc)
        self.db.commit()
        return dict(revertido_id=lanc.id, novo_id=novo.id if novo else None)

    # ---- encerramento ---------------------------------------------------------------------

    def verificar(self, periodo_id: int) -> Verificacao:
        periodo = self._periodo(periodo_id)
        v = Verificacao(pode_encerrar=False)
        if periodo.situacao != SituacaoPeriodo.ABERTO:
            v.bloqueios.append(Bloqueio("situacao", f"Só um período aberto pode ser encerrado (situação: {periodo.situacao.value})."))
        if hoje_local() <= periodo.data_fim:
            v.bloqueios.append(Bloqueio("em_andamento", f"O período ainda não terminou (vai até {periodo.data_fim:%d/%m/%Y})."))
        if periodo.situacao != SituacaoPeriodo.ENCERRADO:
            sem_data = self.inconsistencias()
            if sem_data:
                v.bloqueios.append(Bloqueio(
                    "sem_data", f"{len(sem_data)} registro(s) concluído(s) sem data de conclusão: regularize antes de encerrar."
                ))
            pend = self.pendencias(periodo)
            if pend.total:
                v.bloqueios.append(Bloqueio(
                    "recalculo", f"{pend.total} pendência(s) entre conclusões e pontuação: recalcule a apuração."
                ))
            r = self.painel.resultado(periodo)
            for categoria in CategoriaPontuacao:
                for c in classificar(r.linhas, r.participantes, r.premios, categoria):
                    if c.premio_pendente:
                        colocacoes = ", ".join(f"{x}º" for x in c.colocacoes_disputadas)
                        v.bloqueios.append(Bloqueio(
                            "empate", f"{'Gestores' if categoria == CategoriaPontuacao.GESTOR else 'Executores'}: "
                                      f"{c.nome} empatado(a) em {c.posicao}º com {c.pontos} pts, disputando prêmio de {colocacoes}."
                        ))
            v.avisos = [f"{d['rotulo']}: {', '.join(d['motivos'])}." for d in self.divergencias(periodo)]
        v.pode_encerrar = not v.bloqueios
        return v

    def encerrar(self, periodo_id: int) -> GamificacaoPeriodo:
        periodo = self._periodo(periodo_id)
        v = self.verificar(periodo_id)
        if not v.pode_encerrar:
            raise RegraInvalida("Não é possível encerrar: " + " ".join(b.mensagem for b in v.bloqueios))
        r = self.painel.resultado(periodo)
        regras = list(self.db.scalars(select(GamificacaoRegra).order_by(GamificacaoRegra.ordem)))
        agora = utcnow()
        dados = dict(
            versao=1,
            periodo=dict(id=periodo.id, nome=periodo.nome, ano=periodo.ano, data_inicio=periodo.data_inicio.isoformat(),
                         data_fim=periodo.data_fim.isoformat()),
            encerrado_em=agora.isoformat(), encerrado_por=dict(id=self.autor.id, nome=self.autor.nome),
            regras=[dict(gatilho=g.gatilho.value, nome=g.nome, pontos=g.pontos, ativo=g.ativo) for g in regras],
            premios=[dict(categoria=p.categoria, colocacao=p.colocacao, nome=p.nome, descricao=p.descricao,
                          valor=str(p.valor) if p.valor is not None else None) for p in r.premios],
            participantes={str(k): vars(p) for k, p in r.participantes.items()},
            lancamentos=[l.para_json() for l in r.linhas],
            total_pontos=sum(l.pontos for l in r.linhas),
        )
        self.db.add(GamificacaoFotografia(periodo_id=periodo.id, dados=dados, criado_por_id=self.autor.id, criado_em=agora))
        periodo.situacao = SituacaoPeriodo.ENCERRADO
        periodo.encerrado_em, periodo.encerrado_por_id = agora, self.autor.id
        auditar(self.db, EventoAuditoria.ENCERRAMENTO,
                f"Apuração de “{periodo.nome}” encerrada: {len(r.linhas)} lançamento(s), {dados['total_pontos']} pts, "
                f"{len(r.premios)} prêmio(s).", autor_id=self.autor.id, periodo_id=periodo.id)
        self.db.commit()
        return periodo

    def reabrir(self, periodo_id: int, justificativa: str) -> GamificacaoPeriodo:
        justificativa = _justificativa(justificativa)
        periodo = self._periodo(periodo_id)
        if periodo.situacao != SituacaoPeriodo.ENCERRADO:
            raise RegraInvalida("Só um período encerrado pode ser reaberto.")
        if (foto := self.painel.fotografia_vigente(periodo.id)) is not None:
            foto.substituida_em = utcnow()
        periodo.situacao = SituacaoPeriodo.ABERTO
        periodo.encerrado_em = periodo.encerrado_por_id = None
        auditar(self.db, EventoAuditoria.REABERTURA, f"Apuração de “{periodo.nome}” reaberta (o resultado encerrado continua guardado).",
                autor_id=self.autor.id, justificativa=justificativa, periodo_id=periodo.id)
        self.db.commit()
        return periodo

    # ---- relatório de auditoria ------------------------------------------------------------------

    def eventos(self, periodo: GamificacaoPeriodo) -> list[GamificacaoAuditoria]:
        """Do período (encerramento, reabertura, recálculo, prêmios...) e dos lançamentos com data nele."""
        inicio, fim = janela_utc(periodo)
        L, A = GamificacaoLancamento, GamificacaoAuditoria
        lancamentos = select(L.id).where(L.ocorrido_em >= inicio, L.ocorrido_em < fim)
        return list(self.db.scalars(
            select(A).where(or_(A.periodo_id == periodo.id, A.lancamento_id.in_(lancamentos))).order_by(A.criado_em.desc(), A.id.desc())
        ))

    def relatorio(self, periodo_id: int | None, categoria: str | None = None, usuario_id: int | None = None,
                  plano_id: int | None = None, acao_id: int | None = None, classificacao: str | None = None) -> dict:
        periodo = self.painel.obter_periodo(periodo_id)
        r = self.painel.resultado(periodo)
        todas = r.linhas
        linhas = [
            l for l in todas
            if (categoria is None or l.categoria == categoria) and (usuario_id is None or l.usuario_id == usuario_id)
            and (plano_id is None or l.plano_id == plano_id) and (acao_id is None or l.acao_id == acao_id)
            and (classificacao is None or l.classificacao == classificacao)
        ]
        totais: dict[tuple[int, str], dict] = {}
        for l in linhas:
            t = totais.setdefault((l.usuario_id, l.categoria), dict(usuario_id=l.usuario_id, participante=l.participante,
                                                                     categoria=l.categoria, lancamentos=0, pontos=0))
            t["lancamentos"] += 1
            t["pontos"] += l.pontos
        ranking_total = sum(c.pontos for cat in CategoriaPontuacao for c in classificar(todas, r.participantes, r.premios, cat))
        return dict(
            periodo_id=periodo.id, periodo_nome=periodo.nome, situacao=periodo.situacao.value, encerrado=r.encerrado,
            items=linhas,
            totais=sorted(totais.values(), key=lambda t: (t["categoria"], -t["pontos"], t["participante"].casefold())),
            total_pontos=sum(l.pontos for l in linhas), total_lancamentos=len(linhas),
            total_periodo=sum(l.pontos for l in todas), total_ranking=ranking_total,
            opcoes=dict(
                participantes=sorted({(l.usuario_id, l.participante) for l in todas}, key=lambda x: x[1].casefold()),
                planos=sorted({(l.plano_id, f"{l.plano_codigo} — {l.plano_nome}") for l in todas}, key=lambda x: x[1]),
                acoes=sorted({(l.acao_id, f"{l.plano_codigo} · Ação {l.acao_codigo}") for l in todas if l.acao_id}, key=lambda x: x[1]),
            ),
            eventos=[self.evento_dto(e) for e in self.eventos(periodo)],
        )

    @staticmethod
    def evento_dto(e: GamificacaoAuditoria) -> dict:
        return dict(id=e.id, evento=e.evento.value, detalhe=e.detalhe, justificativa=e.justificativa,
                    autor=e.autor.nome if e.autor else "Sistema", criado_em=e.criado_em, lancamento_id=e.lancamento_id)


def linha_relatorio(l: LinhaPontuacao) -> dict:
    """Linha do relatório como o front e a exportação usam (rótulos legíveis)."""
    return dict(
        lancamento=f"#{l.lancamento_id}", participante=l.participante,
        categoria="Gestor" if l.categoria == CategoriaPontuacao.GESTOR.value else "Executor",
        plano_codigo=l.plano_codigo, plano_nome=l.plano_nome, acao_codigo=l.acao_codigo, acao_descricao=l.acao_descricao,
        concluido_em=l.concluido_em, conclusao_local=data_local(l.concluido_em), prazo=l.prazo,
        classificacao=CLASSIFICACAO_ROTULO[l.classificacao], pontos=l.pontos, regra=l.regra, origem=l.origem,
    )

