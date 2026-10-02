from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_permission
from app.models import Usuario
from app.routers.params import resolver_periodo_ou_422
from app.services.gamificacao_service import FiltrosGamificacao, GamificacaoService
from app.services.periodo import TipoPeriodo

router = APIRouter(prefix="/gamificacao", tags=["gamificacao"])

# O ranking é da fábrica toda: não segue a visibilidade de planos.
UsuarioGamificacao = Annotated[Usuario, Depends(require_permission("gamificacao:ver"))]


def filtros_query(
    periodo: TipoPeriodo = TipoPeriodo.MES_ATUAL,
    data_inicio: date | None = None,
    data_fim: date | None = None,
    area_id: int | None = Query(default=None, description="Área do colaborador."),
    setor_id: int | None = Query(default=None, description="Setor do colaborador."),
    equipe_id: int | None = Query(default=None, description="Equipe cadastrada: só os membros dela."),
) -> FiltrosGamificacao:
    return FiltrosGamificacao(
        periodo=resolver_periodo_ou_422(periodo, data_inicio, data_fim),
        area_id=area_id,
        setor_id=setor_id,
        equipe_id=equipe_id,
    )


FiltrosDep = Annotated[FiltrosGamificacao, Depends(filtros_query)]


# ---- schemas -----------------------------------------------------------------------------


class ResumoGamificacao(BaseModel):
    periodo_inicio: date
    periodo_fim: date
    periodo_anterior_inicio: date
    periodo_anterior_fim: date
    colaboradores: int
    planos_ativos: int
    planos_concluidos: int
    acoes_concluidas: int
    acoes_no_prazo: int
    percentual_no_prazo: float | None
    pontos_distribuidos: int


class ColaboradorRanking(BaseModel):
    posicao: int
    usuario_id: int
    nome: str
    avatar_url: str | None
    area: str | None
    setor: str | None
    pontos: int
    planos_fechados: int
    acoes_no_prazo: int
    acoes_atrasadas: int
    desempenho: float | None
    pontos_periodo_anterior: int
    variacao: int
    tendencia: Literal["subiu", "caiu", "estavel", "novo"]


class PaginaRanking(BaseModel):
    items: list[ColaboradorRanking]
    total: int
    page: int
    page_size: int


class Podio(BaseModel):
    suficiente: bool
    minimo: int
    colaboradores_pontuando: int
    items: list[ColaboradorRanking]


class RegraPontuacao(BaseModel):
    id: int
    gatilho: str
    nome: str
    descricao: str
    aplica_a: str
    pontos: int
    ativo: bool


class OpcaoDaArea(BaseModel):
    """Setor ou equipe, com a área a que pertence (para filtrar em cascata)."""

    id: int
    nome: str
    area_id: int


class OpcaoArea(BaseModel):
    id: int
    nome: str


class OpcoesGamificacao(BaseModel):
    areas: list[OpcaoArea]
    setores: list[OpcaoDaArea]
    equipes: list[OpcaoDaArea]


# ---- endpoints -------------------------------------------------------------------------------


@router.get("/resumo", response_model=ResumoGamificacao)
def resumo(f: FiltrosDep, _: UsuarioGamificacao, db: Session = Depends(get_db)):
    return GamificacaoService(db).resumo(f)


@router.get("/ranking", response_model=PaginaRanking)
def ranking(
    f: FiltrosDep,
    _: UsuarioGamificacao,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
    db: Session = Depends(get_db),
):
    return GamificacaoService(db).ranking(f, page, page_size)


@router.get("/top3", response_model=Podio)
def top3(f: FiltrosDep, _: UsuarioGamificacao, db: Session = Depends(get_db)):
    """Pódio só com dados suficientes (pelo menos `minimo` colaboradores com pontos); senão `items` vem vazio."""
    return GamificacaoService(db).top3(f)


@router.get("/regras", response_model=list[RegraPontuacao])
def regras(_: UsuarioGamificacao, db: Session = Depends(get_db)):
    return GamificacaoService(db).regras()


@router.get("/opcoes", response_model=OpcoesGamificacao)
def opcoes(_: UsuarioGamificacao, db: Session = Depends(get_db)):
    return GamificacaoService(db).opcoes()
