"""Relatórios: pré-visualização (paginada) e exportação usam exatamente a mesma consulta e ordem."""

from datetime import date, datetime
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_permission
from app.core.security import utcnow
from app.core.tempo import como_utc, hoje_local
from app.models import Usuario
from app.models.enums import StatusAcao
from app.routers.params import PeriodoOpcionalDep
from app.routers.planos import FiltrosDep, OrdenacaoDep
from app.schemas.dashboard import ReferenciaPlano
from app.schemas.plano import FormatoExportacao, PlanoListaItem
from app.services.exportacao import ArquivoGerado
from app.services.plano_service import ExportacaoGrandeDemais, PlanoService
from app.services.regras import SituacaoPrazo
from app.services.relatorio_acoes_service import FiltrosRelatorioAcoes, RelatorioAcoesService

router = APIRouter(prefix="/relatorios", tags=["relatorios"])

UsuarioRelatorios = Annotated[Usuario, Depends(require_permission("relatorios:ver"))]
PageDep = Annotated[int, Query(ge=1)]
PageSizeDep = Annotated[int, Query(ge=1, le=500)]


class MetaRelatorio(BaseModel):
    filtros_aplicados: list[str] = Field(description="Descrição legível dos filtros (a mesma usada no arquivo exportado).")
    gerado_em: datetime
    total: int
    page: int
    page_size: int


class RelatorioPlanos(MetaRelatorio):
    items: list[PlanoListaItem]


class LinhaRelatorioAcao(BaseModel):
    id: int
    plano: ReferenciaPlano
    numero: str = Field(description='"2" (ação principal) ou "2.1" (subação).')
    acao_origem: str | None = Field(description='Subação: "2 — descrição" da ação principal.')
    depende_de: str | None = Field(description='Números dos pré-requisitos ("1, 3").')
    descricao: str
    responsavel: str
    area: str
    setor: str | None
    prazo_inicio: str | None = Field(description="Prazo inicial estimado.")
    iniciada_em: datetime | None = Field(description="Início real.")
    prazo: str
    prioridade: str
    status: StatusAcao
    situacao: SituacaoPrazo | None
    progresso: int
    no_prazo: bool | None = Field(description="Só para concluídas: entregue até o prazo?")
    criado_em: datetime
    concluida_em: datetime | None


class RelatorioAcoes(MetaRelatorio):
    items: list[LinhaRelatorioAcao]


def _arquivo(arquivo: ArquivoGerado) -> Response:
    return Response(
        content=arquivo.conteudo,
        media_type=arquivo.media_type,
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(arquivo.nome)}"},
    )


# ---- planos ----------------------------------------------------------------------------------


@router.get("/planos", response_model=RelatorioPlanos)
def relatorio_planos(
    filtros: FiltrosDep, ordenacao: OrdenacaoDep, usuario: UsuarioRelatorios,
    page: PageDep = 1, page_size: PageSizeDep = 50, db: Session = Depends(get_db),
):
    """Filtros iguais aos da listagem de Planos: período, área, setor, responsável, status, prioridade, tipo, origem."""
    svc = PlanoService(db, usuario, hoje_local())
    pagina = svc.listar(filtros, ordenacao, page, page_size)
    return RelatorioPlanos(
        filtros_aplicados=svc.descrever_filtros(filtros), gerado_em=como_utc(utcnow()),
        total=pagina.total, page=page, page_size=page_size, items=pagina.items,
    )


@router.get("/planos/exportar", response_class=Response, responses={200: {"content": {"text/csv": {}, "application/pdf": {}}}})
def exportar_planos(
    filtros: FiltrosDep, ordenacao: OrdenacaoDep, usuario: UsuarioRelatorios, formato: FormatoExportacao,
    db: Session = Depends(get_db),
):
    try:
        return _arquivo(PlanoService(db, usuario, hoje_local()).exportar(filtros, ordenacao, formato))
    except ExportacaoGrandeDemais as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from None


# ---- ações -----------------------------------------------------------------------------------


def filtros_acoes_query(
    periodo: PeriodoOpcionalDep,
    responsavel_id: int | None = None,
    plano_id: int | None = None,
    status_: Annotated[list[StatusAcao], Query(alias="status")] = [],  # noqa: B006
    situacao: Annotated[list[SituacaoPrazo], Query(description="atrasada|vencendo|em_andamento|concluida")] = [],  # noqa: B006
    prazo_de: date | None = None,
    prazo_ate: date | None = None,
) -> FiltrosRelatorioAcoes:
    if prazo_de and prazo_ate and prazo_de > prazo_ate:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "`prazo_de` deve ser anterior ou igual a `prazo_ate`.")
    return FiltrosRelatorioAcoes(
        responsavel_id=responsavel_id, plano_id=plano_id, status=status_, situacao=situacao,
        prazo_de=prazo_de, prazo_ate=prazo_ate, periodo=periodo,
    )


FiltrosAcoesDep = Annotated[FiltrosRelatorioAcoes, Depends(filtros_acoes_query)]


@router.get("/acoes", response_model=RelatorioAcoes)
def relatorio_acoes(
    filtros: FiltrosAcoesDep, usuario: UsuarioRelatorios,
    page: PageDep = 1, page_size: PageSizeDep = 50, db: Session = Depends(get_db),
):
    svc = RelatorioAcoesService(db, usuario, hoje_local())
    linhas, total = svc.listar(filtros, page, page_size)
    return RelatorioAcoes(
        filtros_aplicados=svc.descrever_filtros(filtros), gerado_em=como_utc(utcnow()),
        total=total, page=page, page_size=page_size,
        items=[
            LinhaRelatorioAcao(
                id=a.id, plano=ReferenciaPlano(id=a.plano_id, codigo=a.plano_codigo, nome=a.plano_nome),
                numero=a.numero, acao_origem=a.acao_origem, depende_de=a.depende_de,
                descricao=a.descricao, responsavel=a.responsavel, area=a.area, setor=a.setor,
                prazo_inicio=a.prazo_inicio.isoformat() if a.prazo_inicio else None, iniciada_em=a.iniciada_em,
                prazo=a.prazo.isoformat(), prioridade=a.prioridade,
                status=a.status, situacao=a.situacao, progresso=a.progresso, no_prazo=a.no_prazo,
                criado_em=a.criado_em, concluida_em=a.concluida_em,
            )
            for a in linhas
        ],
    )


@router.get("/acoes/exportar", response_class=Response, responses={200: {"content": {"text/csv": {}, "application/pdf": {}}}})
def exportar_acoes(
    filtros: FiltrosAcoesDep, usuario: UsuarioRelatorios, formato: FormatoExportacao, db: Session = Depends(get_db),
):
    try:
        return _arquivo(RelatorioAcoesService(db, usuario, hoje_local()).exportar(filtros, formato.value))
    except ExportacaoGrandeDemais as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from None
