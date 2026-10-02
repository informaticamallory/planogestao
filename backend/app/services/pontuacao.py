"""Crédito automático de pontos da gamificação.

Chamado pelos services de Plano e Ação no momento da conclusão, na mesma transação:
se a conclusão não for gravada, o crédito também não é. Nada aqui é recalculado depois.
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Acao, GamificacaoLancamento, GamificacaoRegra, GatilhoPontuacao, PlanoDeAcao
from app.models.enums import ReferenciaNotificacao, StatusAcao, StatusPlano
from app.services.regras import acao_concluida_no_prazo


def _regra(db: Session, gatilho: GatilhoPontuacao) -> GamificacaoRegra | None:
    return db.scalar(select(GamificacaoRegra).where(GamificacaoRegra.gatilho == gatilho))


def _lancar(db: Session, gatilho: GatilhoPontuacao, usuario_id: int, referencia: ReferenciaNotificacao, referencia_id: int, ocorrido_em) -> GamificacaoLancamento | None:
    regra = _regra(db, gatilho)
    if regra is None:
        return None
    ja_existe = db.scalar(
        select(GamificacaoLancamento.id).where(
            GamificacaoLancamento.referencia_tipo == referencia,
            GamificacaoLancamento.referencia_id == referencia_id,
            GamificacaoLancamento.usuario_id == usuario_id,
        )
    )
    if ja_existe:
        return None
    lancamento = GamificacaoLancamento(
        regra_id=regra.id,
        gatilho=gatilho,
        usuario_id=usuario_id,
        # Regra desativada ainda registra a entrega (com 0 pontos): as contagens do painel continuam completas.
        pontos=regra.pontos if regra.ativo else 0,
        referencia_tipo=referencia,
        referencia_id=referencia_id,
        ocorrido_em=ocorrido_em,
    )
    db.add(lancamento)
    return lancamento


def creditar_conclusao_acao(db: Session, acao: Acao) -> GamificacaoLancamento | None:
    """Disciplina Operacional (no prazo) ou Resiliência e Entrega (fora do prazo), para o executor.
    Subações não pontuam: quem pontua é a entrega da ação principal."""
    if acao.status != StatusAcao.CONCLUIDA or acao.concluida_em is None or acao.eh_subacao:
        return None
    db.flush()  # garante o id da ação recém-criada
    no_prazo = acao_concluida_no_prazo(acao.status, acao.prazo, acao.concluida_em)
    gatilho = GatilhoPontuacao.ACAO_NO_PRAZO if no_prazo else GatilhoPontuacao.ACAO_FORA_DO_PRAZO
    return _lancar(db, gatilho, acao.responsavel_id, ReferenciaNotificacao.ACAO, acao.id, acao.concluida_em)


def creditar_conclusao_plano(db: Session, plano: PlanoDeAcao) -> GamificacaoLancamento | None:
    """Liderança Ativa, para o responsável (gestor) do plano. Só se conclui plano sem ações em aberto."""
    if plano.status != StatusPlano.CONCLUIDO or plano.concluido_em is None:
        return None
    return _lancar(
        db, GatilhoPontuacao.PLANO_CONCLUIDO, plano.responsavel_id, ReferenciaNotificacao.PLANO, plano.id, plano.concluido_em
    )


@dataclass(frozen=True)
class ResultadoCargaHistorica:
    acoes: int
    planos: int


def creditar_historico(db: Session) -> ResultadoCargaHistorica:
    """Carga única para conclusões anteriores à gamificação (ou inseridas pelo seed). Idempotente."""
    acoes = planos = 0
    for acao in db.scalars(select(Acao).where(Acao.status == StatusAcao.CONCLUIDA, Acao.concluida_em.is_not(None))).all():
        acoes += creditar_conclusao_acao(db, acao) is not None
    for plano in db.scalars(select(PlanoDeAcao).where(PlanoDeAcao.status == StatusPlano.CONCLUIDO, PlanoDeAcao.concluido_em.is_not(None))).all():
        planos += creditar_conclusao_plano(db, plano) is not None
    db.commit()
    return ResultadoCargaHistorica(acoes=acoes, planos=planos)


if __name__ == "__main__":
    from app.core.database import SessionLocal

    with SessionLocal() as sessao:
        print(creditar_historico(sessao))
