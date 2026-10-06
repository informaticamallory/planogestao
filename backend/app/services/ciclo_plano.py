"""Status global do plano, calculado pelas ações (regra única, chamada a cada mudança nas ações).

- Não iniciado: nenhuma ação principal iniciada (inclui plano sem ações).
- Em andamento: alguma ação iniciada ou concluída, mas ainda há ações pendentes.
- Concluído: todas as ações principais concluídas.

Recusadas, canceladas e arquivadas não contam; subações também não (a principal só conclui depois delas).
Excluídas nem aparecem (filtro global de exclusão lógica).

Conclusão automática só quando as ações válidas são todas concluídas pela execução normal. Se o plano tem
ação arquivada, ou se a última mudança foi um arquivamento/exclusão, o plano fica APTO À CONCLUSÃO: alguém
autorizado confirma (concluir_manualmente), com o registro de que o objetivo foi atingido. Arquivar não
conclui nem pontua; só a conclusão efetiva do plano gera os pontos do gestor.
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
from app.services.pontuacao import creditar_conclusao_plano, reverter_por_reabertura

MOTIVOS = {
    StatusPlano.NAO_INICIADO: "nenhuma ação iniciada",
    StatusPlano.EM_ANDAMENTO: "ação iniciada, com ações pendentes",
    StatusPlano.CONCLUIDO: "todas as ações concluídas",
}
MOTIVO_REABERTO = "ação reaberta ou nova ação pendente"
MOTIVO_APTO = "ações válidas concluídas: apto à conclusão (aguardando confirmação)"


def acoes_validas(plano: PlanoDeAcao):
    return [a for a in plano.acoes if not a.eh_subacao and a.status not in STATUS_ACAO_DESCARTADOS and a.arquivado_em is None]


def tem_acao_arquivada(plano: PlanoDeAcao) -> bool:
    return any(a.arquivado_em is not None and not a.eh_subacao for a in plano.acoes)


def apto_a_conclusao(plano: PlanoDeAcao) -> bool:
    """Todas as ações válidas concluídas, mas o plano ainda não: falta a confirmação manual."""
    return plano.status != StatusPlano.CONCLUIDO and status_calculado(plano) == StatusPlano.CONCLUIDO


def status_calculado(plano: PlanoDeAcao) -> StatusPlano:
    validas = acoes_validas(plano)
    if not validas:
        return StatusPlano.NAO_INICIADO
    if all(a.status == StatusAcao.CONCLUIDA for a in validas):
        return StatusPlano.CONCLUIDO
    if any(a.status in STATUS_ACAO_INICIADOS for a in validas):
        return StatusPlano.EM_ANDAMENTO
    return StatusPlano.NAO_INICIADO


def recalcular_status(db: Session, plano: PlanoDeAcao, autor_id: int | None = None, *, por_retirada: bool = False) -> bool:
    """Aplica o status calculado. Na conclusão: data, aviso e pontos (Liderança Ativa). True se mudou.
    `autor_id` só identifica quem provocou a mudança nos avisos; o histórico registra o Sistema.
    `por_retirada`: a mudança veio de arquivar/excluir/desarquivar: nunca conclui sozinho."""
    novo = status_calculado(plano)
    anterior = plano.status
    if novo == StatusPlano.CONCLUIDO and anterior != StatusPlano.CONCLUIDO and (por_retirada or tem_acao_arquivada(plano)):
        # Apto à conclusão: fica em andamento até a confirmação manual.
        novo = StatusPlano.EM_ANDAMENTO
        if novo == anterior:
            return False
        motivo = MOTIVO_APTO
    elif novo == anterior:
        return False
    else:
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
        # A data da conclusão anterior continua no histórico. Os pontos do gestor são revertidos
        # (ou mantidos, se pertencem a um período de apuração já encerrado).
        plano.concluido_em = None
        reverter_por_reabertura(db, ReferenciaNotificacao.PLANO, plano.id, f"Plano {plano.codigo}", autor_id, motivo)
    return True


def concluir_manualmente(db: Session, plano: PlanoDeAcao, autor_id: int, observacao: str | None) -> None:
    """Confirmação de que o objetivo foi atingido (plano apto à conclusão). Credita o gestor como uma
    conclusão normal; o histórico registra quem confirmou."""
    texto = "Conclusão confirmada: objetivo atingido" + (f" — {observacao}" if observacao else "")
    registrar_historico_plano(db, plano, autor_id, EventoPlano.ALTERACAO, "status", plano.status, StatusPlano.CONCLUIDO, motivo=texto[:200])
    plano.status = StatusPlano.CONCLUIDO
    plano.concluido_em = utcnow()
    _avisar_conclusao(db, plano, autor_id)
    creditar_conclusao_plano(db, plano)


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
