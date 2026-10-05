"""Lançamentos de pontos da gamificação (extrato auditável).

Chamado pelos services de Plano e Ação na mesma transação da conclusão/reabertura: se a mudança não for
gravada, o lançamento também não é.

Regras (apuração por período, pela data EFETIVA da conclusão, em America/Sao_Paulo):
- Gestor: plano concluído → pontos para o responsável pelo plano (mesmo concluído fora do prazo).
- Executor: ação concluída até o fim do dia do prazo → "no prazo"; depois → "fora do prazo".
  Sub-itens não pontuam.
- Um lançamento VÁLIDO por item (chave_valida). Repetir a operação, atualizar a página ou recalcular
  não duplica.
- Reabertura: reverte o lançamento (fica no histórico, com motivo), e uma nova conclusão pontua de novo,
  no período dela. Se o lançamento pertence a um período ENCERRADO, ele é mantido (o resultado encerrado
  não muda) e a nova conclusão não pontua outra vez; a reabertura fica registrada na auditoria.
- Troca posterior de responsável ou de prazo não mexe no que já foi lançado (correção é explícita).
"""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.security import utcnow
from app.core.tempo import data_local
from app.models import Acao, PlanoDeAcao
from app.models.enums import ReferenciaNotificacao, StatusAcao, StatusPlano
from app.models.gamificacao import (
    CATEGORIA_DO_GATILHO,
    EventoAuditoria,
    GamificacaoAuditoria,
    GamificacaoLancamento,
    GamificacaoPeriodo,
    GamificacaoRegra,
    GatilhoPontuacao,
    OrigemLancamento,
    SituacaoLancamento,
    SituacaoPeriodo,
)
from app.services.regras import acao_concluida_no_prazo


def chave_item(referencia: ReferenciaNotificacao, referencia_id: int) -> str:
    return f"{referencia.value}:{referencia_id}"


def periodo_encerrado_em(db: Session, momento_utc: datetime) -> GamificacaoPeriodo | None:
    """Período ENCERRADO que contém a data (local) do momento, se houver."""
    dia = data_local(momento_utc)
    return db.scalar(
        select(GamificacaoPeriodo).where(
            GamificacaoPeriodo.situacao == SituacaoPeriodo.ENCERRADO,
            GamificacaoPeriodo.data_inicio <= dia,
            GamificacaoPeriodo.data_fim >= dia,
        )
    )


def lancamento_valido(db: Session, referencia: ReferenciaNotificacao, referencia_id: int) -> GamificacaoLancamento | None:
    return db.scalar(select(GamificacaoLancamento).where(GamificacaoLancamento.chave_valida == chave_item(referencia, referencia_id)))


def auditar(db: Session, evento: EventoAuditoria, detalhe: str, *, autor_id: int | None = None, justificativa: str | None = None,
            periodo_id: int | None = None, lancamento: GamificacaoLancamento | None = None,
            referencia: ReferenciaNotificacao | None = None, referencia_id: int | None = None) -> GamificacaoAuditoria:
    registro = GamificacaoAuditoria(
        evento=evento, detalhe=detalhe[:1000], autor_id=autor_id, justificativa=justificativa, periodo_id=periodo_id,
        lancamento_id=lancamento.id if lancamento is not None else None,
        referencia_tipo=referencia or (lancamento.referencia_tipo if lancamento is not None else None),
        referencia_id=referencia_id or (lancamento.referencia_id if lancamento is not None else None),
    )
    db.add(registro)
    return registro


def acao_pontua(acao: Acao) -> bool:
    return acao.status == StatusAcao.CONCLUIDA and acao.concluida_em is not None and not acao.eh_subacao


def plano_pontua(plano: PlanoDeAcao) -> bool:
    return plano.status == StatusPlano.CONCLUIDO and plano.concluido_em is not None and not plano.rascunho


def _gravar(db: Session, lancamento: GamificacaoLancamento) -> GamificacaoLancamento | None:
    try:
        # Savepoint: duas gravações simultâneas do mesmo item esbarram na chave única sem derrubar a operação.
        with db.begin_nested():
            db.add(lancamento)
            db.flush()
    except IntegrityError:
        return None
    return lancamento


def _novo(db: Session, gatilho: GatilhoPontuacao, usuario_id: int, referencia: ReferenciaNotificacao, referencia_id: int,
          plano_id: int, ocorrido_em: datetime, prazo, origem: OrigemLancamento, autor_id: int | None) -> GamificacaoLancamento | None:
    regra = db.scalar(select(GamificacaoRegra).where(GamificacaoRegra.gatilho == gatilho))
    if regra is None or lancamento_valido(db, referencia, referencia_id) is not None:
        return None
    # Resultado encerrado não muda em silêncio: nada entra num período encerrado (reabra-o antes).
    if periodo_encerrado_em(db, ocorrido_em) is not None:
        return None
    return _gravar(db, GamificacaoLancamento(
        regra_id=regra.id, gatilho=gatilho, categoria=CATEGORIA_DO_GATILHO[gatilho], usuario_id=usuario_id,
        # Regra desativada ainda registra a entrega (com 0 pontos): as contagens continuam completas.
        pontos=regra.pontos if regra.ativo else 0, regra_nome=regra.nome,
        referencia_tipo=referencia, referencia_id=referencia_id, plano_id=plano_id,
        ocorrido_em=ocorrido_em, prazo_considerado=prazo, situacao=SituacaoLancamento.VALIDO,
        chave_valida=chave_item(referencia, referencia_id), origem=origem, criado_por_id=autor_id,
    ))


def lancar_acao(db: Session, acao: Acao, origem: OrigemLancamento = OrigemLancamento.AUTOMATICO,
                autor_id: int | None = None) -> GamificacaoLancamento | None:
    if not acao_pontua(acao):
        return None
    db.flush()  # garante o id da ação recém-criada
    no_prazo = acao_concluida_no_prazo(acao.status, acao.prazo, acao.concluida_em)
    gatilho = GatilhoPontuacao.ACAO_NO_PRAZO if no_prazo else GatilhoPontuacao.ACAO_FORA_DO_PRAZO
    return _novo(db, gatilho, acao.responsavel_id, ReferenciaNotificacao.ACAO, acao.id, acao.plano_id,
                 acao.concluida_em, acao.prazo, origem, autor_id)


def lancar_plano(db: Session, plano: PlanoDeAcao, origem: OrigemLancamento = OrigemLancamento.AUTOMATICO,
                 autor_id: int | None = None) -> GamificacaoLancamento | None:
    if not plano_pontua(plano):
        return None
    return _novo(db, GatilhoPontuacao.PLANO_CONCLUIDO, plano.responsavel_id, ReferenciaNotificacao.PLANO, plano.id, plano.id,
                 plano.concluido_em, None, origem, autor_id)


# Nomes usados pelos services de Plano e Ação (conclusão automática).
def creditar_conclusao_acao(db: Session, acao: Acao) -> GamificacaoLancamento | None:
    return lancar_acao(db, acao)


def creditar_conclusao_plano(db: Session, plano: PlanoDeAcao) -> GamificacaoLancamento | None:
    return lancar_plano(db, plano)


def reverter(db: Session, lancamento: GamificacaoLancamento, motivo: str, autor_id: int | None) -> None:
    lancamento.situacao = SituacaoLancamento.REVERTIDO
    lancamento.chave_valida = None
    lancamento.revertido_em = utcnow()
    lancamento.revertido_por_id = autor_id
    lancamento.motivo_reversao = motivo[:500]
    db.flush()


def reverter_por_reabertura(db: Session, referencia: ReferenciaNotificacao, referencia_id: int, rotulo: str,
                            autor_id: int | None, motivo: str | None = None) -> None:
    """Item reaberto (ação reaberta ou plano que voltou a ter pendências)."""
    lancamento = lancamento_valido(db, referencia, referencia_id)
    if lancamento is None:
        return
    encerrado = periodo_encerrado_em(db, lancamento.ocorrido_em)
    if encerrado is not None:
        auditar(
            db, EventoAuditoria.MANTIDO,
            f"{rotulo} reaberto. A pontuação ({lancamento.pontos} pts, lançamento #{lancamento.id}) pertence ao período "
            f"encerrado “{encerrado.nome}” e foi mantida; uma nova conclusão não pontua outra vez.",
            autor_id=autor_id, justificativa=motivo, periodo_id=encerrado.id, lancamento=lancamento,
        )
        return
    reverter(db, lancamento, f"Item reaberto{': ' + motivo if motivo else ''}", autor_id)
    auditar(
        db, EventoAuditoria.REVERSAO,
        f"{rotulo} reaberto: lançamento #{lancamento.id} ({lancamento.pontos} pts) revertido.",
        autor_id=autor_id, justificativa=motivo, lancamento=lancamento,
    )


def creditar_historico(db: Session) -> int:
    """Carga para conclusões sem lançamento (seed, dados antigos). Idempotente; devolve quantos criou."""
    criados = 0
    for acao in db.scalars(select(Acao).where(Acao.status == StatusAcao.CONCLUIDA, Acao.concluida_em.is_not(None))).all():
        criados += lancar_acao(db, acao, OrigemLancamento.RECALCULO) is not None
    for plano in db.scalars(select(PlanoDeAcao).where(PlanoDeAcao.status == StatusPlano.CONCLUIDO, PlanoDeAcao.concluido_em.is_not(None))).all():
        criados += lancar_plano(db, plano, OrigemLancamento.RECALCULO) is not None
    db.commit()
    return criados


if __name__ == "__main__":
    from app.core.database import SessionLocal

    with SessionLocal() as sessao:
        print(f"{creditar_historico(sessao)} lançamento(s) criado(s).")
