import re
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import require_admin, require_permission
from app.core.tempo import como_utc
from app.models import Area, Usuario
from app.schemas.comum import Opcao, Pagina
from app.services.admin_usuarios_service import DadosUsuario, UsuariosAdminService

router = APIRouter(prefix="/usuarios", tags=["usuarios"])

UsuarioAdmin = Annotated[Usuario, Depends(require_admin)]
_EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class UsuarioOpcao(BaseModel):
    id: int
    nome: str
    area: str | None


@router.get("/opcoes", response_model=list[UsuarioOpcao])
def buscar_usuarios(
    _: Annotated[Usuario, Depends(require_permission("planos:ver"))],
    q: Annotated[str, Query(max_length=100, description="Parte do nome ou e-mail.")] = "",
    limite: Annotated[int, Query(ge=1, le=50)] = 20,
    db: Session = Depends(get_db),
):
    """Usuários ativos para atribuir responsáveis (só id, nome e área)."""
    stmt = (
        select(Usuario.id, Usuario.nome, Area.nome.label("area"))
        .outerjoin(Area, Usuario.area_id == Area.id)
        .where(Usuario.ativo.is_(True))
        .order_by(Usuario.nome)
        .limit(limite)
    )
    termo = q.strip()
    if termo:
        stmt = stmt.where(
            or_(Usuario.nome.contains(termo, autoescape=True), Usuario.email.contains(termo, autoescape=True))
        )
    return [UsuarioOpcao(id=i, nome=n, area=a) for i, n, a in db.execute(stmt)]


# ---- Administração (somente perfil Administrador) ------------------------------------------------


class UsuarioAdminItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    nome: str
    email: str
    perfil: Opcao
    area: Opcao | None
    setor: Opcao | None
    ativo: bool
    avatar_url: str | None
    ultimo_login_em: datetime | None
    criado_em: datetime
    todas_areas: bool = Field(description="Todas as áreas, inclusive as futuras.")
    areas_autorizadas: list[Opcao] = Field(description="Áreas cujos planos o usuário acessa (separadas da lotação).")
    acesso_automatico: bool = Field(description="Administrador: todas as áreas, sem configuração.")
    sem_areas_autorizadas: bool = Field(description="Pendência: não é Administrador e não tem área autorizada.")

    @classmethod
    def de(cls, u: Usuario) -> "UsuarioAdminItem":
        return cls(
            id=u.id, nome=u.nome, email=u.email, perfil=Opcao(id=u.perfil.id, nome=u.perfil.nome),
            area=Opcao(id=u.area.id, nome=u.area.nome) if u.area else None,
            setor=Opcao(id=u.setor.id, nome=u.setor.nome) if u.setor else None,
            ativo=u.ativo, avatar_url=u.avatar_url,
            ultimo_login_em=como_utc(u.ultimo_login_em) if u.ultimo_login_em else None,
            criado_em=como_utc(u.criado_em),
            todas_areas=u.todas_areas, areas_autorizadas=[Opcao(id=a.id, nome=a.nome) for a in u.areas_autorizadas],
            acesso_automatico=u.eh_administrador, sem_areas_autorizadas=u.areas_de_acesso == set(),
        )


class UsuarioBase(BaseModel):
    nome: str = Field(min_length=3, max_length=150)
    email: str = Field(max_length=255)
    perfil_id: int
    area_id: int | None = None
    setor_id: int | None = None
    ativo: bool = True
    avatar_url: str | None = Field(default=None, max_length=500, description="Só é alterada quando enviada.")
    todas_areas: bool | None = Field(default=None, description="Todas as áreas (inclui futuras). Não enviado = mantém.")
    areas_autorizadas: list[int] | None = Field(
        default=None, max_length=500, description="Substitui as áreas autorizadas. Não enviado = mantém (na criação: a lotação)."
    )

    @field_validator("nome")
    @classmethod
    def _nome(cls, v: str) -> str:
        v = " ".join(v.split())
        if len(v) < 3:
            raise ValueError("Informe o nome completo.")
        return v

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        v = v.strip().lower()
        if not _EMAIL.match(v):
            raise ValueError("E-mail inválido.")
        return v

    @field_validator("avatar_url")
    @classmethod
    def _avatar(cls, v: str | None) -> str | None:
        v = (v or "").strip() or None
        # "/usuarios/fotos/..." = foto enviada pelo próprio usuário em Meu Perfil.
        if v and not v.startswith(("https://", "http://", "/usuarios/fotos/")):
            raise ValueError("A foto deve ser um endereço http(s).")
        return v


def _validar_senha(v: str | None) -> str | None:
    if v is None or v == "":
        return None
    if len(v) < 8 or not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
        raise ValueError("A senha deve ter pelo menos 8 caracteres, com letras e números.")
    return v


class UsuarioCriar(UsuarioBase):
    senha: str = Field(max_length=128, description="Senha inicial (mín. 8 caracteres, letras e números).")

    @field_validator("senha")
    @classmethod
    def _senha(cls, v: str) -> str:
        if not v:
            raise ValueError("Informe a senha inicial.")
        return _validar_senha(v)  # type: ignore[return-value]


class UsuarioAtualizar(UsuarioBase):
    nova_senha: str | None = Field(default=None, max_length=128, description="Preencha só para redefinir a senha.")

    @field_validator("nova_senha")
    @classmethod
    def _senha(cls, v: str | None) -> str | None:
        return _validar_senha(v)


def _dados(corpo: UsuarioBase, senha: str | None) -> DadosUsuario:
    return DadosUsuario(
        nome=corpo.nome, email=corpo.email, perfil_id=corpo.perfil_id, area_id=corpo.area_id,
        setor_id=corpo.setor_id, ativo=corpo.ativo, avatar_url=corpo.avatar_url, senha=senha,
        alterar_avatar="avatar_url" in corpo.model_fields_set,
        todas_areas=corpo.todas_areas, areas_autorizadas=corpo.areas_autorizadas,
    )


@router.get("", response_model=Pagina[UsuarioAdminItem])
def listar_usuarios(
    admin: UsuarioAdmin,
    q: Annotated[str, Query(max_length=100)] = "",
    perfil_id: int | None = None,
    area_id: int | None = None,
    ativo: bool | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    db: Session = Depends(get_db),
):
    pagina = UsuariosAdminService(db, admin).listar(q, perfil_id, area_id, ativo, page, page_size)
    return {**pagina, "items": [UsuarioAdminItem.de(u) for u in pagina["items"]]}


@router.post("", response_model=UsuarioAdminItem, status_code=status.HTTP_201_CREATED)
def criar_usuario(corpo: UsuarioCriar, admin: UsuarioAdmin, db: Session = Depends(get_db)):
    return UsuarioAdminItem.de(UsuariosAdminService(db, admin).criar(_dados(corpo, corpo.senha)))


class PendenciaUsuario(BaseModel):
    id: int
    nome: str
    perfil: str
    area: str | None


class PendenciaAtribuicao(BaseModel):
    usuario: PendenciaUsuario
    papel: str
    plano_id: int
    plano_codigo: str
    plano_area: str
    acao_id: int | None
    acao: str | None


class PendenciasAreas(BaseModel):
    sem_area: list[PendenciaUsuario]
    atribuicoes: list[PendenciaAtribuicao]


def _pendente(u: Usuario) -> PendenciaUsuario:
    return PendenciaUsuario(id=u.id, nome=u.nome, perfil=u.perfil.nome, area=u.area.nome if u.area else None)


@router.get("/pendencias-areas", response_model=PendenciasAreas)
def pendencias_areas(admin: UsuarioAdmin, db: Session = Depends(get_db)):
    """Usuários ativos sem área autorizada e atribuições (responsáveis) em planos de áreas não autorizadas."""
    p = UsuariosAdminService(db, admin).pendencias_areas()
    return PendenciasAreas(
        sem_area=[_pendente(u) for u in p["sem_area"]],
        atribuicoes=[
            PendenciaAtribuicao(
                usuario=_pendente(x["usuario"]), papel=x["papel"], plano_id=x["plano"].id, plano_codigo=x["plano"].codigo,
                plano_area=x["plano"].area.nome, acao_id=x["acao"].id if x["acao"] else None,
                acao=f"{x['acao'].numero_exibicao} — {x['acao'].descricao[:80]}" if x["acao"] else None,
            )
            for x in p["atribuicoes"]
        ],
    )


@router.get("/{usuario_id}", response_model=UsuarioAdminItem)
def detalhe_usuario(usuario_id: int, admin: UsuarioAdmin, db: Session = Depends(get_db)):
    return UsuarioAdminItem.de(UsuariosAdminService(db, admin).detalhe(usuario_id))


@router.put("/{usuario_id}", response_model=UsuarioAdminItem)
def atualizar_usuario(usuario_id: int, corpo: UsuarioAtualizar, admin: UsuarioAdmin, db: Session = Depends(get_db)):
    return UsuarioAdminItem.de(UsuariosAdminService(db, admin).atualizar(usuario_id, _dados(corpo, corpo.nova_senha)))


@router.delete("/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
def inativar_usuario(usuario_id: int, admin: UsuarioAdmin, db: Session = Depends(get_db)):
    """Usuários não são apagados (há histórico ligado a eles): a exclusão inativa e encerra as sessões."""
    UsuariosAdminService(db, admin).inativar(usuario_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
