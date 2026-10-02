from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_role
from app.core.security import utcnow
from app.core.tempo import como_utc, hoje_local
from app.models import Notificacao, Usuario
from app.services.alertas_prazo import verificar_prazos
from app.services.eventos import TipoEvento

router = APIRouter(prefix="/notificacoes", tags=["notificacoes"])

UsuarioLogado = Annotated[Usuario, Depends(get_current_user)]


class NotificacaoItem(BaseModel):
    id: int
    tipo: str
    titulo: str
    mensagem: str
    lida: bool
    lida_em: datetime | None
    referencia_tipo: str | None
    referencia_id: int | None
    criado_em: datetime


class PaginaNotificacoes(BaseModel):
    items: list[NotificacaoItem]
    total: int
    page: int
    page_size: int
    nao_lidas: int


class Contagem(BaseModel):
    nao_lidas: int


class ResultadoMarcacao(BaseModel):
    atualizadas: int


class ResultadoVerificacaoPrazos(BaseModel):
    acoes_verificadas: int
    planos_verificados: int
    notificacoes_criadas: int


def _item(n: Notificacao) -> NotificacaoItem:
    return NotificacaoItem(
        id=n.id, tipo=n.tipo, titulo=n.titulo, mensagem=n.mensagem, lida=n.lida,
        lida_em=como_utc(n.lida_em) if n.lida_em else None,
        referencia_tipo=n.referencia_tipo.value if n.referencia_tipo else None,
        referencia_id=n.referencia_id, criado_em=como_utc(n.criado_em),
    )


def _nao_lidas(db: Session, usuario_id: int) -> int:
    return db.scalar(
        select(func.count()).select_from(Notificacao).where(Notificacao.usuario_id == usuario_id, Notificacao.lida.is_(False))
    ) or 0


@router.get("", response_model=PaginaNotificacoes)
def listar(
    usuario: UsuarioLogado,
    tipo: Annotated[list[str], Query(description="Um ou mais tipos (ex.: acao_vencendo).")] = [],  # noqa: B006
    lida: bool | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    db: Session = Depends(get_db),
):
    """Notificações do usuário logado, mais recentes primeiro."""
    invalidos = set(tipo) - set(TipoEvento.TODOS)
    if invalidos:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Tipo(s) inválido(s): {', '.join(sorted(invalidos))}.")
    stmt = select(Notificacao).where(Notificacao.usuario_id == usuario.id)
    if tipo:
        stmt = stmt.where(Notificacao.tipo.in_(tipo))
    if lida is not None:
        stmt = stmt.where(Notificacao.lida.is_(lida))
    total = db.scalar(select(func.count()).select_from(stmt.subquery())) or 0
    itens = db.scalars(
        stmt.order_by(Notificacao.criado_em.desc(), Notificacao.id.desc()).offset((page - 1) * page_size).limit(page_size)
    ).all()
    return PaginaNotificacoes(
        items=[_item(n) for n in itens], total=total, page=page, page_size=page_size, nao_lidas=_nao_lidas(db, usuario.id)
    )


@router.get("/contagem", response_model=Contagem)
def contagem(usuario: UsuarioLogado, db: Session = Depends(get_db)):
    """Leve, para o polling do sino."""
    return Contagem(nao_lidas=_nao_lidas(db, usuario.id))


@router.patch("/ler-todas", response_model=ResultadoMarcacao)
def ler_todas(
    usuario: UsuarioLogado,
    tipo: Annotated[list[str], Query()] = [],  # noqa: B006
    db: Session = Depends(get_db),
):
    stmt = update(Notificacao).where(Notificacao.usuario_id == usuario.id, Notificacao.lida.is_(False))
    if tipo:
        stmt = stmt.where(Notificacao.tipo.in_(tipo))
    resultado = db.execute(stmt.values(lida=True, lida_em=utcnow()))
    db.commit()
    return ResultadoMarcacao(atualizadas=resultado.rowcount or 0)


@router.patch("/{notificacao_id}/ler", response_model=NotificacaoItem)
def ler(notificacao_id: int, usuario: UsuarioLogado, db: Session = Depends(get_db)):
    n = db.get(Notificacao, notificacao_id)
    # 404 também para notificação de outro usuário (não revela que existe).
    if n is None or n.usuario_id != usuario.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notificação não encontrada.")
    if not n.lida:
        n.lida, n.lida_em = True, utcnow()
        db.commit()
    return _item(n)


@router.post(
    "/verificar-prazos",
    response_model=ResultadoVerificacaoPrazos,
    dependencies=[Depends(require_role(["Administrador"]))],
)
def verificar_agora(db: Session = Depends(get_db)):
    """Executa já a varredura do job de alertas de prazo (normalmente roda a cada 15 min)."""
    r = verificar_prazos(db, hoje_local())
    return ResultadoVerificacaoPrazos(
        acoes_verificadas=r.acoes_verificadas, planos_verificados=r.planos_verificados, notificacoes_criadas=r.notificacoes_criadas
    )
