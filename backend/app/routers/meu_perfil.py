"""Meu Perfil: rotas do próprio usuário sobre a sua conta (qualquer usuário logado).

Separadas de propósito das rotas administrativas (/usuarios/{id}, só Administrador): aqui o alvo é
sempre o usuário do token — não há id na URL — e o schema aceita apenas nome, tema, tamanho da
fonte e cor de destaque. Qualquer outro campo no corpo (perfil_id, area_id, permissões...) é rejeitado com 422.

Registrado antes de `usuarios.router` no main.py, para "/usuarios/me" não cair em "/usuarios/{usuario_id}".
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Path, Response, UploadFile, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import Usuario
from app.routers.auth import CLIENT_TYPE_HEADER, _is_mobile, _responder
from app.routers.usuarios import _validar_senha
from app.core.foto import normalizar_ajuste
from app.schemas.auth import AjusteFoto, CorDestaque, TamanhoFonte, TemaPreferido, TokenResponse, UsuarioLogado
from app.services import preferencias_notificacao
from app.services.armazenamento import obter_armazenamento
from app.services.auth_service import AuthService, SenhaAtualIncorreta, montar_usuario_logado
from app.services.meu_perfil_service import NOME_FOTO, PASTA_FOTOS, DadosPerfil, MeuPerfilService

router = APIRouter(prefix="/usuarios/me", tags=["meu perfil"])
fotos_router = APIRouter(prefix="/usuarios/fotos", tags=["meu perfil"])

UsuarioLogadoDep = Annotated[Usuario, Depends(get_current_user)]

# Campos de acesso/cadastro que só a Administração altera: mensagem explícita em vez do genérico do Pydantic.
_CAMPOS_ADMINISTRATIVOS = {
    "perfil_id", "perfil", "area_id", "area", "setor_id", "setor", "permissoes",
    "email", "ativo", "senha", "nova_senha", "avatar_url", "id",
}


class UsuarioSelfUpdate(BaseModel):
    """Envie só o que quer mudar. `cor_destaque: null` volta à cor padrão."""

    model_config = ConfigDict(extra="forbid")

    nome: str | None = Field(default=None, max_length=150, description="Nome de exibição.")
    tema: TemaPreferido | None = None
    tamanho_fonte: TamanhoFonte | None = Field(default=None, description="Escala dos textos no web e no app.")
    cor_destaque: CorDestaque | None = None

    @model_validator(mode="before")
    @classmethod
    def _sem_campos_administrativos(cls, dados: Any) -> Any:
        if isinstance(dados, dict):
            proibidos = sorted(_CAMPOS_ADMINISTRATIVOS & dados.keys())
            if proibidos:
                raise ValueError(
                    f"Campo(s) não permitido(s) no próprio perfil: {', '.join(proibidos)}. "
                    "Perfil de acesso, área, função/cargo e e-mail são alterados só pela Administração."
                )
        return dados

    @field_validator("nome")
    @classmethod
    def _nome(cls, v: str | None) -> str | None:
        if v is None:
            return None
        v = " ".join(v.split())
        if len(v) < 3:
            raise ValueError("Informe um nome com pelo menos 3 caracteres.")
        return v


class TrocarSenha(BaseModel):
    model_config = ConfigDict(extra="forbid")

    senha_atual: str = Field(min_length=1, max_length=128)
    nova_senha: str = Field(max_length=128, description="Mín. 8 caracteres, com letras e números.")

    @field_validator("nova_senha")
    @classmethod
    def _regras(cls, v: str) -> str:
        if not v:
            raise ValueError("Informe a nova senha.")
        return _validar_senha(v)  # type: ignore[return-value]

    @model_validator(mode="after")
    def _diferente(self) -> "TrocarSenha":
        if self.senha_atual == self.nova_senha:
            raise ValueError("A nova senha deve ser diferente da atual.")
        return self


@router.put("", response_model=UsuarioLogado)
def atualizar_meu_perfil(corpo: UsuarioSelfUpdate, usuario: UsuarioLogadoDep, db: Session = Depends(get_db)):
    enviados = corpo.model_fields_set
    dados = DadosPerfil(
        nome=corpo.nome,
        tema=corpo.tema,
        tamanho_fonte=corpo.tamanho_fonte,
        cor_destaque=corpo.cor_destaque,
        limpar_cor="cor_destaque" in enviados and corpo.cor_destaque is None,
    )
    return montar_usuario_logado(MeuPerfilService(db, usuario).atualizar(dados))


@router.post("/foto", response_model=UsuarioLogado)
def enviar_foto(
    usuario: UsuarioLogadoDep,
    arquivo: Annotated[UploadFile, File(description="JPEG, PNG ou WebP de até 5 MB. Guardada inteira, sem recorte.")],
    formato: Annotated[str, Form()] = "quadrado",
    encaixe: Annotated[str, Form()] = "preencher",
    x: Annotated[float, Form()] = 0.5,
    y: Annotated[float, Form()] = 0.5,
    zoom: Annotated[float, Form()] = 1.0,
    db: Session = Depends(get_db),
):
    """Foto nova com o enquadramento feito no editor (enviados juntos: cancelar no editor não envia nada)."""
    ajuste = normalizar_ajuste(formato, encaixe, x, y, zoom)
    return montar_usuario_logado(MeuPerfilService(db, usuario).trocar_foto(arquivo.file, obter_armazenamento(), ajuste))


@router.put("/foto/ajuste", response_model=UsuarioLogado)
def ajustar_foto(corpo: AjusteFoto, usuario: UsuarioLogadoDep, db: Session = Depends(get_db)):
    """Muda só o enquadramento da foto atual (formato, encaixe, posição, zoom); a imagem guardada não muda."""
    ajuste = normalizar_ajuste(corpo.formato, corpo.encaixe, corpo.x, corpo.y, corpo.zoom)
    return montar_usuario_logado(MeuPerfilService(db, usuario).ajustar_foto(ajuste))


@router.delete("/foto", response_model=UsuarioLogado)
def remover_foto(usuario: UsuarioLogadoDep, db: Session = Depends(get_db)):
    return montar_usuario_logado(MeuPerfilService(db, usuario).remover_foto(obter_armazenamento()))


@router.put("/senha", response_model=TokenResponse)
def trocar_senha(
    corpo: TrocarSenha,
    usuario: UsuarioLogadoDep,
    response: Response,
    db: Session = Depends(get_db),
    user_agent: str | None = Header(default=None),
    client_type: str | None = Header(default=None, alias=CLIENT_TYPE_HEADER),
):
    """Exige a senha atual. Encerra as sessões dos outros dispositivos e devolve uma sessão nova para este."""
    try:
        sessao = AuthService(db).trocar_senha(usuario, corpo.senha_atual, corpo.nova_senha, user_agent)
    except SenhaAtualIncorreta:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Senha atual incorreta.") from None
    return _responder(sessao, response, _is_mobile(client_type))


class PreferenciaNotificacaoItem(BaseModel):
    tipo: str
    rotulo: str
    descricao: str
    sistema: bool = Field(description="Receber na central do sistema (e no push do app).")
    email: bool = Field(description="Receber por e-mail.")
    padrao_sistema: bool
    padrao_email: bool
    personalizado: bool = Field(description="False = usando o padrão do tipo.")


class PreferenciaNotificacaoSalvar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tipo: str = Field(max_length=50)
    sistema: bool
    email: bool


@router.get("/preferencias-notificacao", response_model=list[PreferenciaNotificacaoItem])
def listar_preferencias_notificacao(usuario: UsuarioLogadoDep, db: Session = Depends(get_db)):
    """Os sete avisos operacionais, com os canais escolhidos (ou o padrão). Convites de primeiro acesso e
    mensagens de segurança não dependem destas preferências."""
    return preferencias_notificacao.listar(db, usuario.id)


@router.put("/preferencias-notificacao", response_model=list[PreferenciaNotificacaoItem])
def salvar_preferencias_notificacao(
    corpo: list[PreferenciaNotificacaoSalvar], usuario: UsuarioLogadoDep, db: Session = Depends(get_db),
):
    """Grava os tipos enviados (os demais ficam como estão). Tipo inexistente ou repetido → 422."""
    if len(corpo) > len(preferencias_notificacao.TIPOS):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Tipos demais na mesma gravação.")
    try:
        return preferencias_notificacao.salvar(db, usuario.id, [i.model_dump() for i in corpo])
    except preferencias_notificacao.PreferenciaInvalida as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from None


@fotos_router.get("/{arquivo}", response_class=FileResponse, include_in_schema=False)
def foto(arquivo: Annotated[str, Path(max_length=60)]):
    """Foto de perfil. Pública como qualquer <img>: o nome é aleatório (128 bits) e muda a cada troca."""
    if not NOME_FOTO.match(arquivo):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Foto não encontrada.")
    caminho = obter_armazenamento().caminho_local(f"{PASTA_FOTOS}/{arquivo}")
    if not caminho.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Foto não encontrada.")
    return FileResponse(
        caminho,
        media_type="image/webp",
        headers={"Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff"},
    )
