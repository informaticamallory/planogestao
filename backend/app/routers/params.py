"""Parâmetros de query reutilizados por vários routers."""

from datetime import date
from typing import Annotated

from fastapi import Depends, HTTPException, status

from app.core.tempo import hoje_local
from app.services.periodo import Periodo, PeriodoInvalido, TipoPeriodo, resolver_periodo


def resolver_periodo_ou_422(periodo: TipoPeriodo, data_inicio: date | None, data_fim: date | None) -> Periodo:
    try:
        return resolver_periodo(periodo, hoje_local(), data_inicio, data_fim)
    except PeriodoInvalido as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from None


def periodo_query(
    periodo: TipoPeriodo = TipoPeriodo.MES_ATUAL,
    data_inicio: date | None = None,
    data_fim: date | None = None,
) -> Periodo:
    """?periodo=hoje|7d|30d|mes_atual|trimestre|ano|personalizado (padrão: mês atual)."""
    return resolver_periodo_ou_422(periodo, data_inicio, data_fim)


def periodo_opcional_query(
    periodo: TipoPeriodo | None = None,
    data_inicio: date | None = None,
    data_fim: date | None = None,
) -> Periodo | None:
    """Igual a periodo_query, mas sem período informado não há filtro."""
    return None if periodo is None else resolver_periodo_ou_422(periodo, data_inicio, data_fim)


PeriodoDep = Annotated[Periodo, Depends(periodo_query)]
PeriodoOpcionalDep = Annotated[Periodo | None, Depends(periodo_opcional_query)]
