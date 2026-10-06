"""Página Colaboradores: convite de primeiro acesso (Gestor e Administrador, permissão colaboradores:convidar)."""

from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_permission
from app.models import Usuario
from app.services.convites_service import ConvitesService

router = APIRouter(prefix="/colaboradores", tags=["colaboradores"])

UsuarioConvite = Annotated[Usuario, Depends(require_permission("colaboradores:convidar"))]


class SetorConvite(BaseModel):
    id: int
    nome: str


class AreaConvite(BaseModel):
    id: int
    nome: str
    setores: list[SetorConvite]


class OpcoesConvite(BaseModel):
    areas: list[AreaConvite] = Field(description="Só as áreas que quem convida acessa.")
    pode_todas_areas: bool
    perfil: str = Field(description='Sempre "Colaborador".')


class ConviteNovo(BaseModel):
    # Campos extras (ex.: perfil_id, permissões) são recusados: o perfil é sempre Colaborador.
    model_config = ConfigDict(extra="forbid")

    nome: str = Field(min_length=3, max_length=150)
    email: str = Field(max_length=255)
    area_id: int = Field(description="Área de lotação.")
    setor_id: int | None = None
    areas_autorizadas: list[int] = Field(default_factory=list, max_length=200)
    todas_areas: bool = False

    @field_validator("nome")
    @classmethod
    def _nome(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v) < 3:
            raise ValueError("Informe o nome completo.")
        return v


class ConviteItem(BaseModel):
    id: int
    usuario_id: int
    nome: str
    email: str
    area: str | None
    setor: str | None
    todas_areas: bool
    areas: list[str]
    situacao: Literal["pendente", "ativado", "cancelado", "expirado"]
    envio: str | None = Field(description="pendente | enviando | enviado | falha | desabilitado | modelo_inativo | ignorado | sem_endereco")
    erro_envio: str | None
    enviado_em: datetime | None
    criado_em: datetime
    expira_em: datetime
    ativado_em: datetime | None
    criado_por: str
    pode_reenviar: bool
    pode_cancelar: bool


def _item(service: ConvitesService, convite_id: int) -> dict:
    return next(i for i in service.listar() if i["id"] == convite_id)


@router.get("/opcoes", response_model=OpcoesConvite)
def opcoes(usuario: UsuarioConvite, db: Session = Depends(get_db)):
    return ConvitesService(db, usuario).opcoes()


@router.get("/convites", response_model=list[ConviteItem])
def listar(usuario: UsuarioConvite, db: Session = Depends(get_db)):
    """Convites que você criou (o Administrador vê todos), o mais recente de cada pessoa."""
    return ConvitesService(db, usuario).listar()


@router.post("/convites", response_model=ConviteItem, status_code=status.HTTP_201_CREATED)
def convidar(corpo: ConviteNovo, usuario: UsuarioConvite, db: Session = Depends(get_db)):
    """Cadastra a conta (perfil Colaborador, "Convite pendente") e envia o e-mail com o link de primeiro acesso."""
    service = ConvitesService(db, usuario)
    convite = service.criar(corpo.nome, corpo.email, corpo.area_id, corpo.setor_id, corpo.areas_autorizadas, corpo.todas_areas)
    return _item(service, convite.id)


@router.post("/convites/{convite_id}/reenviar", response_model=ConviteItem)
def reenviar(convite_id: int, usuario: UsuarioConvite, db: Session = Depends(get_db)):
    """Novo link (48 h) e novo e-mail; o link anterior deixa de valer. Serve também para tentar de novo após falha."""
    service = ConvitesService(db, usuario)
    return _item(service, service.reenviar(convite_id).id)


@router.post("/convites/{convite_id}/cancelar", response_model=ConviteItem)
def cancelar(convite_id: int, usuario: UsuarioConvite, db: Session = Depends(get_db)):
    """Invalida o link. A conta não é excluída (nem uma conta já ativada é afetada)."""
    service = ConvitesService(db, usuario)
    return _item(service, service.cancelar(convite_id).id)
