from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_permission
from app.core.tempo import hoje_local
from app.models import Usuario
from app.schemas.dashboard import (
    AtividadeRecente,
    CalendarioMes,
    EvolucaoPlanos,
    MinhaAcao,
    PlanoRecente,
    ResumoDashboard,
    StatusAcoes,
)
from app.routers.params import PeriodoDep
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["dashboard"])

UsuarioDashboard = Annotated[Usuario, Depends(require_permission("dashboard:ver"))]


def _service(db: Session, usuario: Usuario) -> DashboardService:
    return DashboardService(db, usuario, hoje_local())


@router.get("/resumo", response_model=ResumoDashboard)
def resumo(periodo: PeriodoDep, usuario: UsuarioDashboard, db: Session = Depends(get_db)):
    return _service(db, usuario).resumo(periodo)


@router.get("/evolucao-planos", response_model=EvolucaoPlanos)
def evolucao_planos(periodo: PeriodoDep, usuario: UsuarioDashboard, db: Session = Depends(get_db)):
    return _service(db, usuario).evolucao_planos(periodo)


@router.get("/status-acoes", response_model=StatusAcoes)
def status_acoes(periodo: PeriodoDep, usuario: UsuarioDashboard, db: Session = Depends(get_db)):
    return _service(db, usuario).status_acoes(periodo)


@router.get("/planos-recentes", response_model=list[PlanoRecente])
def planos_recentes(
    periodo: PeriodoDep,
    usuario: UsuarioDashboard,
    limite: Annotated[int, Query(ge=1, le=20)] = 5,
    db: Session = Depends(get_db),
):
    return _service(db, usuario).planos_recentes(periodo, limite)


@router.get("/atividades-recentes", response_model=list[AtividadeRecente])
def atividades_recentes(
    periodo: PeriodoDep,
    usuario: UsuarioDashboard,
    limite: Annotated[int, Query(ge=1, le=50)] = 10,
    db: Session = Depends(get_db),
):
    return _service(db, usuario).atividades_recentes(periodo, limite)


@router.get("/minhas-acoes", response_model=list[MinhaAcao])
def minhas_acoes(
    usuario: UsuarioDashboard,
    limite: Annotated[int, Query(ge=1, le=50)] = 8,
    db: Session = Depends(get_db),
):
    return _service(db, usuario).minhas_acoes(limite)


@router.get("/calendario", response_model=CalendarioMes)
def calendario(
    usuario: UsuarioDashboard,
    ano: Annotated[int, Query(ge=2000, le=2100)],
    mes: Annotated[int, Query(ge=1, le=12)],
    db: Session = Depends(get_db),
):
    return _service(db, usuario).calendario(ano, mes)
