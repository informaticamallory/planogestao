"""Status global do plano, calculado pelas ações (regra única, chamada a cada mudança nas ações).

- Não iniciado: nenhuma ação principal iniciada (inclui plano sem ações).
- Em andamento: alguma ação iniciada ou concluída, mas ainda há ações pendentes.
- Concluído: todas as ações principais concluídas.

Recusadas e canceladas não contam; subações também não (a principal só conclui depois delas).
"Iniciada" = em andamento, bloqueada ou concluída: aceitar não inicia. A mudança automática vai para
o histórico do plano como alteração do Sistema, com o motivo. Rascunho e arquivado não são status.
"""

from sqlalchemy.orm import Session

from app.core.security import utcnow
from app.models import PlanoDeAcao
from app.models.enums import (
    STATUS_ACAO_DESCARTADOS,
    STATUS_ACAO_INICIADOS,
    EventoPlano,
    ReferenciaNotificacao,
    StatusAcao,
    StatusPlano,
)
from app.services.eventos import Evento, TipoEvento, publicar
from app.services.historico import registrar_historico_plano
from app.services.pontuacao import creditar_conclusao_plano

MOTIVOS = {
    StatusPlano.NAO_INICIADO: "nenhuma ação iniciada",
    StatusPlano.EM_ANDAMENTO: "ação iniciada, com ações pendentes",
    StatusPlano.CONCLUIDO: "todas as ações concluídas",
}
MOTIVO_REABERTO = "ação reaberta ou nova ação pendente"


def status_calculado(plano: PlanoDeAcao) -> StatusPlano:
    validas = [a for a in plano.acoes if not a.eh_subacao and a.status not in STATUS_ACAO_DESCARTADOS]
    if not validas:
        return StatusPlano.NAO_INICIADO
    if all(a.status == StatusAcao.CONCLUIDA for a in validas):
        return StatusPlano.CONCLUIDO
    if any(a.status in STATUS_ACAO_INICIADOS for a in validas):
        return StatusPlano.EM_ANDAMENTO
    return StatusPlano.NAO_INICIADO


def recalcular_status(db: Session, plano: PlanoDeAcao, autor_id: int | None = None) -> bool:
    """Aplica o status calculado. Na conclusão: data, aviso e pontos (Liderança Ativa). True se mudou.
    `autor_id` só identifica quem provocou a mudança nos avisos; o histórico registra o Sistema."""
    novo = status_calculado(plano)
    anterior = plano.status
    if novo == anterior:
        return False
    motivo = MOTIVO_REABERTO if anterior == StatusPlano.CONCLUIDO else MOTIVOS[novo]
    registrar_historico_plano(db, plano, None, EventoPlano.ALTERACAO, "status", anterior, novo, motivo=motivo)
    plano.status = novo
    if novo == StatusPlano.CONCLUIDO:
        plano.concluido_em = utcnow()
        # Rascunho ainda não foi liberado: sem avisos nem pontos.
        if not plano.rascunho:
            _avisar_conclusao(db, plano, autor_id)
            creditar_conclusao_plano(db, plano)
    elif anterior == StatusPlano.CONCLUIDO:
        # A data da conclusão anterior continua no histórico.
        plano.concluido_em = None
    return True


def _avisar_conclusao(db: Session, plano: PlanoDeAcao, autor_id: int | None) -> None:
    publicar(
        db,
        Evento(
            tipo=TipoEvento.PLANO_CONCLUIDO,
            destinatarios=(plano.criado_por_id, plano.responsavel_id, *(a.responsavel_id for a in plano.acoes)),
            autor_id=autor_id,
            titulo=f"Plano concluído — {plano.codigo}",
            mensagem=f"O plano “{plano.nome}” foi concluído: todas as ações foram concluídas.",
            referencia_tipo=ReferenciaNotificacao.PLANO,
            referencia_id=plano.id,
        ),
    )
