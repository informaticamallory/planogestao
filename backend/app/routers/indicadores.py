from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_permission
from app.core.tempo import hoje_local
from app.models import Usuario
from app.routers.params import resolver_periodo_ou_422
from app.services.indicadores_service import FiltrosIndicadores, IndicadoresService
from app.services.periodo import TipoPeriodo

router = APIRouter(prefix="/indicadores", tags=["indicadores"])

UsuarioIndicadores = Annotated[Usuario, Depends(require_permission("indicadores:ver"))]


def filtros_query(
    periodo: TipoPeriodo = TipoPeriodo.ANO,
    data_inicio: date | None = None,
    data_fim: date | None = None,
    area_id: int | None = None,
    setor_id: int | None = None,
    responsavel_id: int | None = Query(default=None, description="Responsável pelo plano."),
) -> FiltrosIndicadores:
    """Filtros comuns: definem o conjunto de planos (criados no período) analisado por todos os endpoints."""
    return FiltrosIndicadores(
        periodo=resolver_periodo_ou_422(periodo, data_inicio, data_fim),
        area_id=area_id,
        setor_id=setor_id,
        responsavel_id=responsavel_id,
    )


FiltrosDep = Annotated[FiltrosIndicadores, Depends(filtros_query)]


def _svc(db: Session, usuario: Usuario) -> IndicadoresService:
    return IndicadoresService(db, usuario, hoje_local())


# ---- schemas -----------------------------------------------------------------------------


class IndicadoresGerais(BaseModel):
    total_planos: int
    planos_concluidos: int
    planos_em_atraso: int = Field(description="Tag Em atraso (não concluídos com o fim estimado vencido).")
    percentual_planos_concluidos: float | None
    total_acoes: int
    acoes_concluidas: int
    acoes_atrasadas: int
    percentual_acoes_concluidas: float | None
    percentual_acoes_no_prazo: float | None
    percentual_acoes_atrasadas: float | None
    total_subitens: int = Field(description="Sub-itens de todos os níveis dos planos filtrados (sem recusados/cancelados).")
    subitens_concluidos: int
    percentual_subitens_concluidos: float | None = Field(description="Sub-itens concluídos ÷ total de sub-itens. Null sem sub-itens.")
    tempo_medio_conclusao_planos_dias: float | None
    tempo_medio_conclusao_acoes_dias: float | None


class ContagemStatus(BaseModel):
    status: str
    total: int


class CumprimentoPrazo(BaseModel):
    concluidas_no_prazo: int
    concluidas_com_atraso: int
    atrasadas_em_aberto: int
    em_aberto_no_prazo: int
    percentual_no_prazo: float | None


class PlanosAgrupados(BaseModel):
    id: int | None
    nome: str
    total: int
    nao_iniciados: int
    em_andamento: int
    concluidos: int
    em_atraso: int = Field(description="Tag de prazo, à parte: quantos (não iniciados ou em andamento) estão em atraso.")


class PontoMensal(BaseModel):
    mes: str
    criados: int
    concluidos: int
    atrasados: int


class ResponsavelPendencias(BaseModel):
    id: int
    nome: str
    atrasadas: int
    vencendo: int
    em_andamento: int
    total_pendentes: int


class StatusDoGrupo(BaseModel):
    """Status de execução de um grupo de itens (cada item uma vez)."""

    nao_iniciado: int
    em_andamento: int
    concluido: int
    total: int


class ItensPorNivel(StatusDoGrupo):
    nivel: int = Field(description="0 = ações principais; 1, 2… = profundidade do sub-item.")
    nome: str


class SubitensPorResponsavel(StatusDoGrupo):
    id: int
    nome: str


class ItensPorPlano(BaseModel):
    id: int
    codigo: str
    nome: str
    acoes_principais: int
    subitens: int
    concluidos: int = Field(description="Ações principais + sub-itens concluídos.")
    pendentes: int = Field(description="Ações principais + sub-itens não concluídos.")
    em_atraso: int = Field(description="Tag Em atraso, contada à parte do status.")


# ---- endpoints -------------------------------------------------------------------------------


@router.get("/gerais", response_model=IndicadoresGerais)
def gerais(f: FiltrosDep, u: UsuarioIndicadores, db: Session = Depends(get_db)):
    return _svc(db, u).gerais(f)


@router.get("/planos-por-status", response_model=list[ContagemStatus])
def planos_por_status(f: FiltrosDep, u: UsuarioIndicadores, db: Session = Depends(get_db)):
    """Status globais: nao_iniciado | em_andamento | concluido. Arquivados ficam de fora."""
    return _svc(db, u).planos_por_status(f)


@router.get("/planos-por-prazo", response_model=list[ContagemStatus])
def planos_por_prazo(f: FiltrosDep, u: UsuarioIndicadores, db: Session = Depends(get_db)):
    """Situação do prazo dos planos não concluídos: em_atraso | a_vencer | no_prazo (campo `status` = tag)."""
    return _svc(db, u).planos_por_prazo(f)


@router.get("/acoes-por-status", response_model=list[ContagemStatus])
def acoes_por_status(f: FiltrosDep, u: UsuarioIndicadores, db: Session = Depends(get_db)):
    """Status de execução das ações: nao_iniciado | em_andamento | concluido (sem recusadas/canceladas)."""
    return _svc(db, u).acoes_por_status(f)


@router.get("/cumprimento-prazo", response_model=CumprimentoPrazo)
def cumprimento_prazo(f: FiltrosDep, u: UsuarioIndicadores, db: Session = Depends(get_db)):
    return _svc(db, u).cumprimento_prazo(f)


def _agrupado(dimensao: Literal["area", "setor", "responsavel", "prioridade"]):
    def endpoint(f: FiltrosDep, u: UsuarioIndicadores, db: Session = Depends(get_db)):
        return _svc(db, u).planos_por(f, dimensao)

    endpoint.__name__ = f"planos_por_{dimensao}"
    return endpoint


for _dim in ("area", "setor", "responsavel", "prioridade"):
    router.add_api_route(
        f"/planos-por-{_dim}",
        _agrupado(_dim),
        methods=["GET"],
        response_model=list[PlanosAgrupados],
        summary=f"Planos por {_dim}",
    )


@router.get("/itens-por-nivel", response_model=list[ItensPorNivel])
def itens_por_nivel(f: FiltrosDep, u: UsuarioIndicadores, db: Session = Depends(get_db)):
    """Ações principais e sub-itens de todos os níveis, por nível, com o status de execução."""
    return _svc(db, u).itens_por_nivel(f)


@router.get("/subitens-por-responsavel", response_model=list[SubitensPorResponsavel])
def subitens_por_responsavel(f: FiltrosDep, u: UsuarioIndicadores, db: Session = Depends(get_db)):
    return _svc(db, u).subitens_por_responsavel(f)


@router.get("/itens-por-plano", response_model=list[ItensPorPlano])
def itens_por_plano(f: FiltrosDep, u: UsuarioIndicadores, db: Session = Depends(get_db)):
    return _svc(db, u).itens_por_plano(f)


@router.get("/evolucao-mensal", response_model=list[PontoMensal])
def evolucao_mensal(f: FiltrosDep, u: UsuarioIndicadores, db: Session = Depends(get_db)):
    return _svc(db, u).evolucao_mensal(f)


@router.get("/responsaveis-com-pendencias", response_model=list[ResponsavelPendencias])
def responsaveis_com_pendencias(
    f: FiltrosDep,
    u: UsuarioIndicadores,
    limite: Annotated[int, Query(ge=1, le=50)] = 10,
    db: Session = Depends(get_db),
):
    return _svc(db, u).responsaveis_com_pendencias(f, limite)
