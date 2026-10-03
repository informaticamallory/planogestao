"""Módulo Administração: perfis, áreas, setores, tipos de plano, origens e configurações.

Perfis e configurações exigem o perfil Administrador (require_admin). Áreas, setores, tipos de plano e
origens exigem a permissão cadastros:gerenciar (Administrador e Gestor por padrão). Exceção: GET /configuracoes/publicas,
que expõe a qualquer usuário logado os parâmetros usados em textos da interface.
Usuários ficam em routers/usuarios.py (mesma regra).
"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_admin, require_permission
from app.core.tempo import como_utc
from app.models import Configuracao, EnvioEmail, Usuario
from app.schemas.comum import Pagina
from app.services import configuracoes
from app.services.admin_cadastros_service import CadastrosService
from app.services.admin_perfis_service import PerfisService

UsuarioAdmin = Annotated[Usuario, Depends(require_admin)]
# Áreas, setores, tipos de plano e origens: permissão atribuível (Administrador e Gestor por padrão).
UsuarioCadastros = Annotated[Usuario, Depends(require_permission("cadastros:gerenciar"))]


def _sem_conteudo() -> Response:
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _nome_limpo(v: str) -> str:
    v = " ".join(v.split())
    if len(v) < 2:
        raise ValueError("Informe um nome com pelo menos 2 caracteres.")
    return v


# ---- perfis --------------------------------------------------------------------------------------

perfis_router = APIRouter(prefix="/perfis", tags=["administracao"])


class PerfilItem(BaseModel):
    id: int
    nome: str
    descricao: str | None
    usuarios: int
    permissoes: list[str]
    editavel: bool = Field(description="Falso para o Administrador, que é fixo com acesso total.")


class PerfilSalvar(BaseModel):
    nome: str = Field(max_length=50)
    descricao: str | None = Field(default=None, max_length=255)
    permissoes: list[str] = Field(default_factory=list, description="Códigos marcados na matriz.")

    @field_validator("nome")
    @classmethod
    def _nome(cls, v: str) -> str:
        return _nome_limpo(v)

    @field_validator("descricao")
    @classmethod
    def _descricao(cls, v: str | None) -> str | None:
        return (v or "").strip() or None


class ItemMatriz(BaseModel):
    id: str
    nome: str


class PermissaoMatriz(BaseModel):
    codigo: str
    modulo: str
    acao: str
    descricao: str | None


class CatalogoPermissoes(BaseModel):
    modulos: list[ItemMatriz]
    acoes: list[ItemMatriz]
    permissoes: list[PermissaoMatriz]


@perfis_router.get("", response_model=list[PerfilItem])
def listar_perfis(_: UsuarioAdmin, db: Session = Depends(get_db)):
    return PerfisService(db).listar()


@perfis_router.get("/permissoes", response_model=CatalogoPermissoes)
def catalogo_permissoes(_: UsuarioAdmin, db: Session = Depends(get_db)):
    """Linhas e colunas da matriz. Só existem as células que o backend verifica; o módulo Administração não aparece."""
    return PerfisService(db).catalogo()


@perfis_router.post("", response_model=PerfilItem, status_code=status.HTTP_201_CREATED)
def criar_perfil(corpo: PerfilSalvar, _: UsuarioAdmin, db: Session = Depends(get_db)):
    return PerfisService(db).criar(corpo.nome, corpo.descricao, corpo.permissoes)


@perfis_router.get("/{perfil_id}", response_model=PerfilItem)
def detalhe_perfil(perfil_id: int, _: UsuarioAdmin, db: Session = Depends(get_db)):
    return PerfisService(db).detalhe(perfil_id)


@perfis_router.put("/{perfil_id}", response_model=PerfilItem)
def atualizar_perfil(perfil_id: int, corpo: PerfilSalvar, _: UsuarioAdmin, db: Session = Depends(get_db)):
    return PerfisService(db).atualizar(perfil_id, corpo.nome, corpo.descricao, corpo.permissoes)


@perfis_router.delete("/{perfil_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_perfil(perfil_id: int, _: UsuarioAdmin, db: Session = Depends(get_db)):
    PerfisService(db).excluir(perfil_id)
    return _sem_conteudo()


# ---- áreas, setores, tipos de plano -----------------------------------------------------------------


class CadastroSalvar(BaseModel):
    nome: str = Field(max_length=100)
    ativo: bool = True

    @field_validator("nome")
    @classmethod
    def _nome(cls, v: str) -> str:
        return _nome_limpo(v)


class SetorSalvar(CadastroSalvar):
    area_id: int


class AreaItem(BaseModel):
    id: int
    nome: str
    ativo: bool
    usuarios: int
    setores: int
    planos: int


class SetorItem(BaseModel):
    id: int
    nome: str
    ativo: bool
    area_id: int
    area: str
    usuarios: int
    planos: int


class ReferenciaCadastro(BaseModel):
    id: int
    nome: str


class TipoPlanoItem(BaseModel):
    id: int
    nome: str
    ativo: bool
    planos: int
    origens: list[ReferenciaCadastro] = Field(description="Origens compatíveis com o tipo (formulário do plano).")


class OrigemItem(BaseModel):
    id: int
    nome: str
    ativo: bool
    planos: int
    tipos: list[ReferenciaCadastro] = Field(description="Tipos de plano com que a origem é compatível.")


class DefinirOrigensTipo(BaseModel):
    origem_ids: list[int] = Field(max_length=500, description="Substitui a lista inteira (vazia = nenhuma origem).")


areas_router = APIRouter(prefix="/areas", tags=["administracao"])


@areas_router.get("", response_model=list[AreaItem])
def listar_areas(_: UsuarioCadastros, db: Session = Depends(get_db)):
    return CadastrosService(db).listar_areas()


@areas_router.post("", response_model=AreaItem, status_code=status.HTTP_201_CREATED)
def criar_area(corpo: CadastroSalvar, _: UsuarioCadastros, db: Session = Depends(get_db)):
    return CadastrosService(db).salvar_area(corpo.nome, corpo.ativo)


@areas_router.put("/{area_id}", response_model=AreaItem)
def atualizar_area(area_id: int, corpo: CadastroSalvar, _: UsuarioCadastros, db: Session = Depends(get_db)):
    return CadastrosService(db).salvar_area(corpo.nome, corpo.ativo, area_id)


@areas_router.delete("/{area_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_area(area_id: int, _: UsuarioCadastros, db: Session = Depends(get_db)):
    """409 se houver usuários, setores ou planos na área: nesse caso, inative."""
    CadastrosService(db).excluir_area(area_id)
    return _sem_conteudo()


setores_router = APIRouter(prefix="/setores", tags=["administracao"])


@setores_router.get("", response_model=list[SetorItem])
def listar_setores(_: UsuarioCadastros, area_id: int | None = None, db: Session = Depends(get_db)):
    return CadastrosService(db).listar_setores(area_id)


@setores_router.post("", response_model=SetorItem, status_code=status.HTTP_201_CREATED)
def criar_setor(corpo: SetorSalvar, _: UsuarioCadastros, db: Session = Depends(get_db)):
    return CadastrosService(db).salvar_setor(corpo.nome, corpo.area_id, corpo.ativo)


@setores_router.put("/{setor_id}", response_model=SetorItem)
def atualizar_setor(setor_id: int, corpo: SetorSalvar, _: UsuarioCadastros, db: Session = Depends(get_db)):
    return CadastrosService(db).salvar_setor(corpo.nome, corpo.area_id, corpo.ativo, setor_id)


@setores_router.delete("/{setor_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_setor(setor_id: int, _: UsuarioCadastros, db: Session = Depends(get_db)):
    CadastrosService(db).excluir_setor(setor_id)
    return _sem_conteudo()


tipos_router = APIRouter(prefix="/tipos-plano", tags=["administracao"])


@tipos_router.get("", response_model=list[TipoPlanoItem])
def listar_tipos(_: UsuarioCadastros, db: Session = Depends(get_db)):
    return CadastrosService(db).listar_tipos()


@tipos_router.post("", response_model=TipoPlanoItem, status_code=status.HTTP_201_CREATED)
def criar_tipo(corpo: CadastroSalvar, _: UsuarioCadastros, db: Session = Depends(get_db)):
    return CadastrosService(db).salvar_tipo(corpo.nome, corpo.ativo)


@tipos_router.put("/{tipo_id}", response_model=TipoPlanoItem)
def atualizar_tipo(tipo_id: int, corpo: CadastroSalvar, _: UsuarioCadastros, db: Session = Depends(get_db)):
    return CadastrosService(db).salvar_tipo(corpo.nome, corpo.ativo, tipo_id)


@tipos_router.delete("/{tipo_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_tipo(tipo_id: int, _: UsuarioCadastros, db: Session = Depends(get_db)):
    CadastrosService(db).excluir_tipo(tipo_id)
    return _sem_conteudo()


@tipos_router.put("/{tipo_id}/origens", response_model=TipoPlanoItem)
def definir_origens_do_tipo(tipo_id: int, corpo: DefinirOrigensTipo, _: UsuarioCadastros, db: Session = Depends(get_db)):
    """Quais origens são válidas para este tipo (multi-seleção). Planos existentes não mudam."""
    return CadastrosService(db).definir_origens_do_tipo(tipo_id, corpo.origem_ids)


# ---- origens ---------------------------------------------------------------------------------------

origens_router = APIRouter(prefix="/origens", tags=["administracao"])


@origens_router.get("", response_model=list[OrigemItem])
def listar_origens(_: UsuarioCadastros, db: Session = Depends(get_db)):
    return CadastrosService(db).listar_origens()


@origens_router.post("", response_model=OrigemItem, status_code=status.HTTP_201_CREATED)
def criar_origem(corpo: CadastroSalvar, _: UsuarioCadastros, db: Session = Depends(get_db)):
    return CadastrosService(db).salvar_origem(corpo.nome, corpo.ativo)


@origens_router.put("/{origem_id}", response_model=OrigemItem)
def atualizar_origem(origem_id: int, corpo: CadastroSalvar, _: UsuarioCadastros, db: Session = Depends(get_db)):
    return CadastrosService(db).salvar_origem(corpo.nome, corpo.ativo, origem_id)


@origens_router.delete("/{origem_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_origem(origem_id: int, _: UsuarioCadastros, db: Session = Depends(get_db)):
    """409 se houver planos com esta origem: nesse caso, inative."""
    CadastrosService(db).excluir_origem(origem_id)
    return _sem_conteudo()


# ---- configurações ---------------------------------------------------------------------------------

configuracoes_router = APIRouter(prefix="/configuracoes", tags=["administracao"])


class ConfiguracaoItem(BaseModel):
    chave: str
    grupo: str
    rotulo: str
    descricao: str
    valor: int
    padrao: int
    minimo: int
    maximo: int
    unidade: str
    atualizado_em: datetime | None
    atualizado_por: str | None


class ConfiguracaoSalvar(BaseModel):
    valor: int


class ConfiguracoesPublicas(BaseModel):
    dias_alerta_vencimento_acao: int
    dias_alerta_vencimento_plano: int


def _item(d: configuracoes.DefParametro, registro: Configuracao | None) -> ConfiguracaoItem:
    try:
        valor = int(registro.valor) if registro else d.padrao
    except ValueError:
        valor = d.padrao
    return ConfiguracaoItem(
        chave=d.chave, grupo=d.grupo, rotulo=d.rotulo, descricao=d.descricao, valor=valor, padrao=d.padrao,
        minimo=d.minimo, maximo=d.maximo, unidade=d.unidade,
        atualizado_em=como_utc(registro.atualizado_em) if registro else None,
        atualizado_por=registro.atualizado_por.nome if registro and registro.atualizado_por else None,
    )


@configuracoes_router.get("/publicas", response_model=ConfiguracoesPublicas)
def configuracoes_publicas(_: Annotated[Usuario, Depends(get_current_user)]):
    return configuracoes.valores_publicos()


@configuracoes_router.get("", response_model=list[ConfiguracaoItem])
def listar_configuracoes(_: UsuarioAdmin, db: Session = Depends(get_db)):
    return [_item(d, db.get(Configuracao, d.chave)) for d in configuracoes.CATALOGO.values()]


@configuracoes_router.put("/{chave}", response_model=ConfiguracaoItem)
def atualizar_configuracao(chave: str, corpo: ConfiguracaoSalvar, admin: UsuarioAdmin, db: Session = Depends(get_db)):
    definicao = configuracoes.CATALOGO.get(chave)
    if definicao is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Parâmetro inexistente.")
    try:
        registro = configuracoes.gravar(db, chave, corpo.valor, admin.id)
    except configuracoes.ParametroInvalido as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from None
    db.refresh(registro)
    return _item(definicao, registro)


# ---- registro dos e-mails de notificação (somente leitura) ----------------------------------------

envios_email_router = APIRouter(prefix="/envios-email", tags=["administracao"])


class EnvioEmailItem(BaseModel):
    id: int
    evento: str = Field(description="plano_criado | acao_criada | subitem_criado")
    referencia_tipo: str
    referencia_id: int
    usuario_id: int | None
    destinatario: str | None
    assunto: str
    situacao: str = Field(description="pendente | enviando | enviado | falhou | sem_endereco | ignorado | desabilitado")
    tentativas: int
    ultimo_erro: str | None
    criado_em: datetime
    enviado_em: datetime | None
    proxima_tentativa_em: datetime | None


@envios_email_router.get("", response_model=Pagina[EnvioEmailItem])
def listar_envios_email(
    _: UsuarioAdmin,
    situacao: Annotated[str | None, Query(description="Filtra pela situação do envio.")] = None,
    referencia_tipo: Annotated[str | None, Query(description="plano | acao")] = None,
    referencia_id: int | None = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 20,
    db: Session = Depends(get_db),
):
    """Evento, destinatário, data, situação e erro de cada e-mail (mais recentes primeiro)."""
    filtros = [
        c for c in (
            EnvioEmail.situacao == situacao if situacao else None,
            EnvioEmail.referencia_tipo == referencia_tipo if referencia_tipo else None,
            EnvioEmail.referencia_id == referencia_id if referencia_id is not None else None,
        ) if c is not None
    ]
    total = db.scalar(select(func.count()).select_from(EnvioEmail).where(*filtros)) or 0
    linhas = db.scalars(
        select(EnvioEmail).where(*filtros).order_by(EnvioEmail.id.desc()).offset((page - 1) * page_size).limit(page_size)
    )
    itens = [
        EnvioEmailItem(
            id=e.id, evento=e.evento, referencia_tipo=e.referencia_tipo, referencia_id=e.referencia_id, usuario_id=e.usuario_id,
            destinatario=e.destinatario, assunto=e.assunto, situacao=e.situacao, tentativas=e.tentativas, ultimo_erro=e.ultimo_erro,
            criado_em=como_utc(e.criado_em), enviado_em=como_utc(e.enviado_em) if e.enviado_em else None,
            proxima_tentativa_em=como_utc(e.proxima_tentativa_em) if e.proxima_tentativa_em else None,
        )
        for e in linhas
    ]
    return Pagina[EnvioEmailItem](items=itens, total=total, page=page, page_size=page_size)
