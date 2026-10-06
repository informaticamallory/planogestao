"""Exclusão lógica de planos e ações: um filtro global, não uma condição lembrada em cada consulta.

Todo SELECT do ORM (listas, contagens, subconsultas, `db.get`, relacionamentos como `plano.acoes`) ganha
`excluido_em IS NULL` para PlanoDeAcao e Acao. Assim, um plano ou ação excluído some de telas, totais,
exportações, lembretes e da gamificação ao vivo de uma vez, e os sub-itens nunca aparecem soltos.

O registro continua no banco (histórico e auditoria). Para enxergá-lo de propósito:
    db.execute(stmt, execution_options={"incluir_excluidos": True})
SQL textual (migrações) não passa por aqui.
"""

from sqlalchemy import event
from sqlalchemy.orm import ORMExecuteState, Session, with_loader_criteria

from app.models.acao import Acao
from app.models.plano import PlanoDeAcao

INCLUIR_EXCLUIDOS = "incluir_excluidos"


@event.listens_for(Session, "do_orm_execute")
def _sem_excluidos(estado: ORMExecuteState) -> None:
    if not estado.is_select or estado.is_column_load or estado.execution_options.get(INCLUIR_EXCLUIDOS, False):
        return
    estado.statement = estado.statement.options(
        with_loader_criteria(PlanoDeAcao, lambda cls: cls.excluido_em.is_(None), include_aliases=True),
        with_loader_criteria(Acao, lambda cls: cls.excluido_em.is_(None), include_aliases=True),
    )
