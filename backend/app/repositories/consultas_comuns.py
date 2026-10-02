from sqlalchemy import Subquery, case, func, select

from app.models import Acao
from app.models.enums import STATUS_ACAO_DESCARTADOS, StatusAcao


def agregado_acoes_por_plano() -> Subquery:
    """Por plano: total de ações, concluídas e progresso médio (sem recusadas/canceladas e sem subações,
    que são desdobramentos da ação principal e não entram nos números).

    Colunas: plano_id, total_acoes, acoes_concluidas, progresso. Use com outer join
    e coalesce, pois planos sem ações não aparecem aqui.
    """
    return (
        select(
            Acao.plano_id.label("plano_id"),
            func.count().label("total_acoes"),
            func.sum(case((Acao.status == StatusAcao.CONCLUIDA, 1), else_=0)).label("acoes_concluidas"),
            func.avg(Acao.progresso).label("progresso"),
        )
        .where(Acao.status.not_in(STATUS_ACAO_DESCARTADOS), Acao.acao_pai_id.is_(None))
        .group_by(Acao.plano_id)
        .subquery("agregado_acoes")
    )
