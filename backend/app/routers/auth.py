from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.database import get_db
from app.core.deps import get_current_user
from app.models import Usuario
from app.schemas.auth import LoginRequest, RefreshRequest, TokenResponse, UsuarioLogado
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
