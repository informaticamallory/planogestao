"""Minhas Ações: as ações do usuário logado, classificadas por situação de prazo."""

from datetime import date
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import ColumnElement, and_, case, func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_permission
from app.core.tempo import hoje_local
from app.models import Acao, AcaoSolicitacaoAlteracao, PlanoDeAcao, Usuario
from app.models.enums import Prioridade, StatusAcao, StatusSolicitacao
from app.schemas.comum import Pagina
from app.schemas.dashboard import ReferenciaPlano
from app.services.escopo import filtro_areas_autorizadas
from app.services.regras import SituacaoPrazo, situacao_prazo_sql

router = APIRouter(prefix="/minhas-acoes", tags=["minhas-acoes"])

UsuarioDono = Annotated[Usuario, Depends(require_permission("acoes:ver_proprias"))]


class ResumoMinhasAcoes(BaseModel):
    atrasadas: int
    vencendo: int
    em_andamento: int
    concluidas: int


class MinhaAcaoItem(BaseModel):
    id: int
    numero: str = Field(description='"2" (ação principal) ou "2.1" (subação).')
    descricao: str
    acao_origem: str | None = Field(description='Subação: "Ação 2 — descrição" da ação principal.')
    plano: ReferenciaPlano
    prazo: date
    prioridade: Prioridade
    status: StatusAcao
    situacao: SituacaoPrazo
    progresso: int
    solicitacao_pendente: bool


def _base(usuario: Usuario, hoje: date):
    """Expressão de situação + filtro das ações do usuário (sem recusadas/canceladas e sem planos arquivados).

    A expressão é usada sem rótulo no WHERE (o MySQL não aceita alias ali).
    """
    situacao = situacao_prazo_sql(Acao.status, Acao.prazo, hoje)
    filtro: ColumnElement[bool] = and_(
        Acao.responsavel_id == usuario.id,
        # Fora das áreas autorizadas a ação não aparece (o Administrador ajusta o acesso).
        filtro_areas_autorizadas(usuario),
        PlanoDeAcao.arquivado_em.is_(None),
        Acao.arquivado_em.is_(None),
        situacao.is_not(None),
    )
    return situacao, filtro


@router.get("/resumo", response_model=ResumoMinhasAcoes)
def resumo(usuario: UsuarioDono, db: Session = Depends(get_db)):
    """Contadores por situação. Usa a mesma expressão do filtro da listagem, para os números baterem."""
    situacao, filtro = _base(usuario, hoje_local())
    contagem: dict[str, int] = dict(
        db.execute(
            select(situacao, func.count())
            .select_from(Acao)
            .join(PlanoDeAcao, Acao.plano_id == PlanoDeAcao.id)
            .where(filtro)
            .group_by(situacao)
        ).all()
    )
    return ResumoMinhasAcoes(
        atrasadas=contagem.get(SituacaoPrazo.ATRASADA.value, 0),
        vencendo=contagem.get(SituacaoPrazo.VENCENDO.value, 0),
        em_andamento=contagem.get(SituacaoPrazo.EM_ANDAMENTO.value, 0),
        concluidas=contagem.get(SituacaoPrazo.CONCLUIDA.value, 0),
    )


@router.get("", response_model=Pagina[MinhaAcaoItem])
def listar(
    usuario: UsuarioDono,
    situacao_filtro: Annotated[SituacaoPrazo | None, Query(alias="situacao")] = None,
    prazo: Annotated[
        Literal["hoje"] | None,
        Query(description="hoje = ações com prazo na data de hoje (fuso do negócio, decidido no servidor)."),
    ] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    db: Session = Depends(get_db),
):
    hoje = hoje_local()
    situacao, filtro = _base(usuario, hoje)
    if situacao_filtro is not None:
        filtro = and_(filtro, situacao == situacao_filtro.value)
    if prazo == "hoje":
        filtro = and_(filtro, Acao.prazo == hoje)

    pendente = (
        select(AcaoSolicitacaoAlteracao.id)
        .where(AcaoSolicitacaoAlteracao.acao_id == Acao.id, AcaoSolicitacaoAlteracao.status == StatusSolicitacao.PENDENTE)
        .exists()
    )
    # Mais urgentes primeiro; concluídas por último (as mais recentes no topo delas).
    urgencia = case(
        (situacao == SituacaoPrazo.ATRASADA.value, 0),
        (situacao == SituacaoPrazo.VENCENDO.value, 1),
        (situacao == SituacaoPrazo.EM_ANDAMENTO.value, 2),
        else_=3,
    )
    stmt = (
        select(Acao, PlanoDeAcao.codigo, PlanoDeAcao.nome, situacao.label("situacao"), pendente.label("pendente"))
        .join(PlanoDeAcao, Acao.plano_id == PlanoDeAcao.id)
        .where(filtro)
    )
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    linhas = db.execute(
        stmt.order_by(
            urgencia,
            case((situacao == SituacaoPrazo.CONCLUIDA.value, Acao.concluida_em), else_=None).desc(),
            Acao.prazo.asc(),
            Acao.id.asc(),
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()

    return Pagina[MinhaAcaoItem](
        items=[
            MinhaAcaoItem(
                id=a.id,
                numero=a.numero_exibicao,
                descricao=a.descricao,
                # Caminho de origem até o pai imediato: "PA-2026-0001 → Ação 1 → Sub-item 1.2".
                acao_origem=(
                    " → ".join([codigo, *(f"{'Sub-item' if x.eh_subacao else 'Ação'} {x.numero_exibicao}" for x in a.caminho)])
                    + f" — {a.acao_pai.descricao}"
                    if a.acao_pai
                    else None
                ),
                plano=ReferenciaPlano(id=a.plano_id, codigo=codigo, nome=nome),
                prazo=a.prazo,
                prioridade=a.prioridade,
                status=a.status,
                situacao=SituacaoPrazo(sit),
                progresso=a.progresso,
                solicitacao_pendente=bool(pend),
            )
            for a, codigo, nome, sit, pend in linhas
        ],
        total=total,
        page=page,
        page_size=page_size,
    )
