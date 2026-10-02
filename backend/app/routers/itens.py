"""Listagem de itens: ações principais + sub-itens de todos os níveis (destino dos cards do Dashboard)."""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_permission
from app.core.tempo import hoje_local
from app.models import Usuario
from app.models.enums import StatusAcao
from app.routers.params import PeriodoOpcionalDep
from app.schemas.comum import Opcao, Pagina
from app.schemas.dashboard import ReferenciaPlano
from app.schemas.plano import FiltroArquivados
from app.services.painel_itens_service import CampoData, FiltrosItens, GrupoStatus, Nivel, PainelItensService
from app.services.regras import TagPrazo

router = APIRouter(prefix="/itens", tags=["itens"])

UsuarioLeitura = Annotated[Usuario, Depends(require_permission("planos:ver"))]


def filtros_query(
    periodo: PeriodoOpcionalDep,
    plano_id: int | None = None,
    responsavel_id: int | None = None,
    area_id: Annotated[int | None, Query(description="Área do item (não a do plano).")] = None,
    setor_id: int | None = None,
    status: Annotated[list[GrupoStatus], Query(description="nao_iniciado | em_andamento | concluido")] = [],  # noqa: B006
    prazo: Annotated[list[TagPrazo], Query(description="Situação do prazo do item.")] = [],  # noqa: B006
    nivel: Annotated[Nivel | None, Query(description="principal | subacao (qualquer profundidade)")] = None,
    campo_data: Annotated[
        CampoData, Query(description="Qual data o período filtra: criacao (criação do item, padrão) ou prazo (prazo de conclusão).")
    ] = CampoData.CRIACAO,
    arquivados: Annotated[
        FiltroArquivados, Query(description="Exibição: excluir = PAs ativos (padrão), somente = arquivados, incluir = todos.")
    ] = FiltroArquivados.EXCLUIR,
) -> FiltrosItens:
    return FiltrosItens(
        plano_id=plano_id, responsavel_id=responsavel_id, area_id=area_id, setor_id=setor_id, status=status,
        prazo=prazo, nivel=nivel, periodo=periodo, campo_data=campo_data, arquivados=arquivados,
    )


FiltrosDep = Annotated[FiltrosItens, Depends(filtros_query)]


class ItemLista(BaseModel):
    id: int
    numero: str
    nivel: int
    eh_subacao: bool
    descricao: str
    caminho: str = Field(description='Caminho de origem até o pai: "PA-2026-0015 → Ação 1 → Sub-item 1.1".')
    plano: ReferenciaPlano
    responsavel: Opcao
    area: Opcao
    setor: Opcao | None
    prazo_inicio: date | None
    prazo: date
    status: StatusAcao
    grupo_status: GrupoStatus
    prazo_tag: TagPrazo | None
    progresso: int


@router.get("", response_model=Pagina[ItemLista])
def listar(
    f: FiltrosDep,
    usuario: UsuarioLeitura,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    db: Session = Depends(get_db),
):
    """Itens filtrados (destino dos cards do Dashboard e dos detalhamentos)."""
    itens, total = PainelItensService(db, usuario, hoje_local()).listar(f, page, page_size)
    return Pagina[ItemLista](items=itens, total=total, page=page, page_size=page_size)
