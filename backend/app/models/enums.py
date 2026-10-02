import enum

from sqlalchemy import Enum


class Prioridade(str, enum.Enum):
    BAIXA = "baixa"
    MEDIA = "media"
    ALTA = "alta"
    CRITICA = "critica"


class StatusPlano(str, enum.Enum):
    """Status global, CALCULADO pelas ações principais (nunca escolhido à mão):
    nenhuma iniciada → não iniciado; alguma iniciada/concluída com pendências → em andamento;
    todas concluídas → concluído. Rascunho e arquivado são condições à parte, não status."""

    NAO_INICIADO = "nao_iniciado"
    EM_ANDAMENTO = "em_andamento"
    CONCLUIDO = "concluido"


# Planos em execução: contam como ativos, atrasam e disparam alertas.
STATUS_PLANO_EM_EXECUCAO = (StatusPlano.NAO_INICIADO, StatusPlano.EM_ANDAMENTO)


class StatusAcao(str, enum.Enum):
    AGUARDANDO_ACEITE = "aguardando_aceite"
    ACEITA = "aceita"
    EM_ANDAMENTO = "em_andamento"
    BLOQUEADA = "bloqueada"
    CONCLUIDA = "concluida"
    RECUSADA = "recusada"
    CANCELADA = "cancelada"


# Ações que ainda exigem execução (contam para atraso).
STATUS_ACAO_ABERTOS = (
    StatusAcao.AGUARDANDO_ACEITE,
    StatusAcao.ACEITA,
    StatusAcao.EM_ANDAMENTO,
    StatusAcao.BLOQUEADA,
)
# Ações que saem de todos os indicadores.
STATUS_ACAO_DESCARTADOS = (StatusAcao.RECUSADA, StatusAcao.CANCELADA)
# A ação foi iniciada (conta para o plano sair de "não iniciado"). Aceitar não é iniciar.
STATUS_ACAO_INICIADOS = (StatusAcao.EM_ANDAMENTO, StatusAcao.BLOQUEADA, StatusAcao.CONCLUIDA)


class EventoHistorico(str, enum.Enum):
    CRIACAO = "criacao"
    ALTERACAO = "alteracao"
    COMENTARIO = "comentario"
    SOLICITACAO = "solicitacao"  # pedido de alteração de prazo
    RESPOSTA_SOLICITACAO = "resposta_solicitacao"


class StatusSolicitacao(str, enum.Enum):
    PENDENTE = "pendente"
    ACEITA = "aceita"
    RECUSADA = "recusada"


class ReferenciaNotificacao(str, enum.Enum):
    PLANO = "plano"
    ACAO = "acao"
    SOLICITACAO = "solicitacao"


class EventoPlano(str, enum.Enum):
    CRIACAO = "criacao"
    ALTERACAO = "alteracao"
    ARQUIVAMENTO = "arquivamento"
    DESARQUIVAMENTO = "desarquivamento"


def pg_enum(enum_cls: type[enum.Enum], nome: str) -> Enum:
    """ENUM nativo do MySQL gravando o *valor* (ex. "em_andamento"), não o nome do membro."""
    return Enum(enum_cls, name=nome, values_callable=lambda e: [m.value for m in e], validate_strings=True)
