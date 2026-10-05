"""Calendário de ações por prazo.

Os três endpoints usam a mesma consulta base (`_consulta`), o que garante que o número
de um dia na grade é exatamente o tamanho da lista daquele dia.
"""

from calendar import monthrange
from collections import Counter
from datetime import date, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import Select, and_, or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_permission
from app.core.tempo import hoje_local
from app.models import Acao, PlanoDeAcao, Usuario
from app.models.enums import StatusAcao
from app.schemas.comum import Opcao
from app.schemas.dashboard import ReferenciaPlano
from app.services.escopo import filtro_areas_autorizadas, filtro_planos_visiveis
from app.services.regras import SituacaoPrazo, situacao_prazo, situacao_prazo_sql

router = APIRouter(prefix="/calendario", tags=["calendario"])

UsuarioCalendario = Annotated[Usuario, Depends(require_permission("calendario:ver"))]
MAX_DIAS_INTERVALO = 62


class DiaCalendarioResumo(BaseModel):
    data: date
    total: int
    atrasadas: int
    vencendo: int
    em_andamento: int
    concluidas: int


class CalendarioMensal(BaseModel):
    ano: int
    mes: int
    total: int
    dias: list[DiaCalendarioResumo]


class AcaoCalendario(BaseModel):
    id: int
    descricao: str
    plano: ReferenciaPlano
    responsavel: Opcao
    prazo: date
    status: StatusAcao
    situacao: SituacaoPrazo
    progresso: int


class Filtros(BaseModel):
    area_id: int | None = None
    responsavel_id: int | None = None


def filtros_query(area_id: int | None = None, responsavel_id: int | None = None) -> Filtros:
    return Filtros(area_id=area_id, responsavel_id=responsavel_id)


FiltrosDep = Annotated[Filtros, Depends(filtros_query)]


def _consulta(usuario: Usuario, hoje: date, inicio: date, fim: date, f: Filtros) -> Select:
    """Ações visíveis com prazo em [inicio, fim], sem recusadas/canceladas."""
    stmt = (
        select(Acao, PlanoDeAcao.codigo, PlanoDeAcao.nome, Usuario.nome)
        .join(PlanoDeAcao, Acao.plano_id == PlanoDeAcao.id)
        .join(Usuario, Acao.responsavel_id == Usuario.id)
        .where(
            # As próprias subações aparecem mesmo sem acesso ao plano (a pessoa só abre a subação),
            # mas nunca fora das áreas autorizadas.
            or_(filtro_planos_visiveis(usuario), and_(Acao.responsavel_id == usuario.id, filtro_areas_autorizadas(usuario))),
            Acao.prazo.between(inicio, fim),
            situacao_prazo_sql(Acao.status, Acao.prazo, hoje).is_not(None),
        )
    )
    if f.area_id is not None:
        # A área agora é da ação (as ações antigas herdaram a do plano).
        stmt = stmt.where(Acao.area_id == f.area_id)
    if f.responsavel_id is not None:
        stmt = stmt.where(Acao.responsavel_id == f.responsavel_id)
    return stmt


def _itens(db: Session, stmt: Select, hoje: date) -> list[AcaoCalendario]:
    linhas = db.execute(stmt.order_by(Acao.prazo, Acao.id)).all()
    return [
        AcaoCalendario(
            id=a.id,
            descricao=a.descricao,
            plano=ReferenciaPlano(id=a.plano_id, codigo=codigo, nome=nome),
            responsavel=Opcao(id=a.responsavel_id, nome=responsavel),
            prazo=a.prazo,
            status=a.status,
            situacao=situacao_prazo(a.status, a.prazo, hoje),
            progresso=a.progresso,
        )
        for a, codigo, nome, responsavel in linhas
    ]


@router.get("", response_model=CalendarioMensal)
def mensal(
    usuario: UsuarioCalendario,
    filtros: FiltrosDep,
    ano: Annotated[int, Query(ge=2000, le=2100)],
    mes: Annotated[int, Query(ge=1, le=12)],
    db: Session = Depends(get_db),
):
    """Ações do mês agrupadas por dia de prazo, com a contagem por situação (para colorir)."""
    hoje = hoje_local()
    inicio, fim = date(ano, mes, 1), date(ano, mes, monthrange(ano, mes)[1])
    por_dia: dict[date, Counter[SituacaoPrazo]] = {}
    for item in _itens(db, _consulta(usuario, hoje, inicio, fim, filtros), hoje):
        por_dia.setdefault(item.prazo, Counter())[item.situacao] += 1

    dias = [
        DiaCalendarioResumo(
            data=d,
            total=sum(c.values()),
            atrasadas=c[SituacaoPrazo.ATRASADA],
            vencendo=c[SituacaoPrazo.VENCENDO],
            em_andamento=c[SituacaoPrazo.EM_ANDAMENTO],
            concluidas=c[SituacaoPrazo.CONCLUIDA],
        )
        for d, c in sorted(por_dia.items())
    ]
    return CalendarioMensal(ano=ano, mes=mes, total=sum(d.total for d in dias), dias=dias)


@router.get("/dia", response_model=list[AcaoCalendario])
def dia(usuario: UsuarioCalendario, filtros: FiltrosDep, data: date, db: Session = Depends(get_db)):
    """Ações com prazo no dia (mesmos filtros e mesma consulta da grade)."""
    hoje = hoje_local()
    return _itens(db, _consulta(usuario, hoje, data, data, filtros), hoje)


@router.get("/acoes", response_model=list[AcaoCalendario])
def intervalo(
    usuario: UsuarioCalendario,
    filtros: FiltrosDep,
    inicio: date,
    fim: date,
    db: Session = Depends(get_db),
):
    """Ações com prazo no intervalo (visões Semana e Lista). Máximo de 62 dias."""
    if fim < inicio:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "`fim` deve ser igual ou posterior a `inicio`.")
    if fim - inicio > timedelta(days=MAX_DIAS_INTERVALO - 1):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"O intervalo pode ter no máximo {MAX_DIAS_INTERVALO} dias.")
    hoje = hoje_local()
    return _itens(db, _consulta(usuario, hoje, inicio, fim, filtros), hoje)
