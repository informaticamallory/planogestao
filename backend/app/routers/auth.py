from typing import Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import Usuario
from app.routers.usuarios import _validar_senha
from app.schemas.auth import LoginRequest, RefreshRequest, TokenResponse, UsuarioLogado
from app.services.convites_service import ativar_conta, verificar_token
from app.services.erros import RegraInvalida
from app.services.auth_service import (
    AuthService,
    CredenciaisInvalidas,
    SessaoEmitida,
    SessaoInvalida,
    montar_usuario_logado,
)

router = APIRouter(prefix="/auth", tags=["auth"])

# O app mobile se identifica por este header para receber o refresh token no corpo
# (ele o guarda no SecureStore). O web nunca recebe o refresh token no corpo.
CLIENT_TYPE_HEADER = "X-Client-Type"


def _is_mobile(client_type: str | None) -> bool:
    return (client_type or "").lower() == "mobile"


def _definir_cookie(response: Response, refresh_token: str) -> None:
    s = get_settings()
    response.set_cookie(
        key=s.REFRESH_COOKIE_NAME,
        value=refresh_token,
        max_age=s.REFRESH_TOKEN_EXPIRATION_DAYS * 24 * 3600,
        path=s.REFRESH_COOKIE_PATH,
        httponly=True,
        secure=s.COOKIE_SECURE,
        samesite=s.COOKIE_SAMESITE,
    )


def _remover_cookie(response: Response) -> None:
    s = get_settings()
    response.delete_cookie(
        key=s.REFRESH_COOKIE_NAME,
        path=s.REFRESH_COOKIE_PATH,
        httponly=True,
        secure=s.COOKIE_SECURE,
        samesite=s.COOKIE_SAMESITE,
    )


def _responder(sessao: SessaoEmitida, response: Response, mobile: bool) -> TokenResponse:
    if mobile:
        refresh_no_corpo = sessao.refresh_token
    else:
        _definir_cookie(response, sessao.refresh_token)
        refresh_no_corpo = None
    return TokenResponse(
        access_token=sessao.access_token,
        expires_in=sessao.expires_in,
        refresh_token=refresh_no_corpo,
        usuario=montar_usuario_logado(sessao.usuario),
    )


def _refresh_token_da_requisicao(request: Request, body: RefreshRequest | None) -> str | None:
    if body and body.refresh_token:
        return body.refresh_token
    return request.cookies.get(get_settings().REFRESH_COOKIE_NAME)


@router.post("/login", response_model=TokenResponse)
def login(
    dados: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
    user_agent: str | None = Header(default=None),
    client_type: str | None = Header(default=None, alias=CLIENT_TYPE_HEADER),
) -> TokenResponse:
    try:
        sessao = AuthService(db).login(dados.email, dados.senha, user_agent)
    except CredenciaisInvalidas:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "E-mail ou senha inválidos.") from None
    return _responder(sessao, response, _is_mobile(client_type))


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    request: Request,
    response: Response,
    body: RefreshRequest | None = None,
    db: Session = Depends(get_db),
    user_agent: str | None = Header(default=None),
    client_type: str | None = Header(default=None, alias=CLIENT_TYPE_HEADER),
) -> TokenResponse:
    token = _refresh_token_da_requisicao(request, body)
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sessão expirada.")
    try:
        sessao = AuthService(db).renovar(token, user_agent)
    except SessaoInvalida:
        _remover_cookie(response)
        # HTTPException descarta os headers do `response`; repassamos o Set-Cookie de remoção.
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Sessão expirada.",
            headers={"set-cookie": response.headers["set-cookie"]},
        ) from None
    return _responder(sessao, response, _is_mobile(client_type))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    request: Request,
    response: Response,
    body: RefreshRequest | None = None,
    db: Session = Depends(get_db),
) -> None:
    AuthService(db).logout(_refresh_token_da_requisicao(request, body))
    _remover_cookie(response)


@router.get("/me", response_model=UsuarioLogado)
def me(usuario: Usuario = Depends(get_current_user)) -> UsuarioLogado:
    return montar_usuario_logado(usuario)


# ---- primeiro acesso (convite) ---------------------------------------------------------------
# Públicas: o token (no corpo, nunca na URL da API) é a credencial. A senha não aparece em log algum.


class TokenConvite(BaseModel):
    token: str = Field(min_length=10, max_length=200)


class ConviteVerificado(BaseModel):
    situacao: Literal["valido", "expirado", "utilizado", "cancelado", "substituido", "invalido"]
    mensagem: str
    nome: str | None = None
    email: str | None = None


class PrimeiroAcesso(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=10, max_length=200)
    senha: str = Field(max_length=128, description="Mín. 8 caracteres, com letras e números.")
    confirmacao: str = Field(max_length=128)

    @field_validator("senha")
    @classmethod
    def _politica(cls, v: str) -> str:
        if not v:
            raise ValueError("Informe a nova senha.")
        return _validar_senha(v)  # type: ignore[return-value]

    @model_validator(mode="after")
    def _iguais(self) -> "PrimeiroAcesso":
        if self.senha != self.confirmacao:
            raise ValueError("As senhas não coincidem.")
        return self


@router.post("/primeiro-acesso/verificar", response_model=ConviteVerificado)
def verificar_convite(dados: TokenConvite, db: Session = Depends(get_db)) -> ConviteVerificado:
    """Situação do link de convite (para a página de primeiro acesso mostrar a mensagem certa)."""
    v = verificar_token(db, dados.token)
    valido = v.situacao == "valido"
    return ConviteVerificado(
        situacao=v.situacao, mensagem=v.mensagem,
        nome=v.convite.usuario.nome if valido else None, email=v.convite.usuario.email if valido else None,
    )


@router.post("/primeiro-acesso", response_model=TokenResponse)
def primeiro_acesso(
    dados: PrimeiroAcesso,
    response: Response,
    db: Session = Depends(get_db),
    user_agent: str | None = Header(default=None),
    client_type: str | None = Header(default=None, alias=CLIENT_TYPE_HEADER),
) -> TokenResponse:
    """Define a senha, ativa a conta (link de uso único) e já devolve a sessão, pelo mesmo mecanismo do login."""
    try:
        usuario = ativar_conta(db, dados.token, dados.senha)
    except RegraInvalida as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from None
    sessao = AuthService(db).iniciar_sessao(usuario, user_agent)
    return _responder(sessao, response, _is_mobile(client_type))
