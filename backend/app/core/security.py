import hashlib
import secrets
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from app.core.config import get_settings

# Hash usado quando o e-mail não existe, para o tempo de resposta do login
# não revelar se o usuário está cadastrado.
_DUMMY_HASH = bcrypt.hashpw(b"dummy-password", bcrypt.gensalt()).decode()


def hash_senha(senha: str) -> str:
    return bcrypt.hashpw(senha.encode(), bcrypt.gensalt()).decode()


def verificar_senha(senha: str, senha_hash: str | None) -> bool:
    return bcrypt.checkpw(senha.encode(), (senha_hash or _DUMMY_HASH).encode()) and senha_hash is not None


def utcnow() -> datetime:
    # MySQL DATETIME não guarda fuso: todas as datas são gravadas em UTC "naive".
    return datetime.now(UTC).replace(tzinfo=None)


def criar_access_token(usuario_id: int) -> tuple[str, int]:
    settings = get_settings()
    expira_em_segundos = settings.JWT_EXPIRATION * 60
    agora = datetime.now(UTC)
    payload = {
        "sub": str(usuario_id),
        "type": "access",
        "iat": agora,
        "exp": agora + timedelta(seconds=expira_em_segundos),
    }
    token = jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)
    return token, expira_em_segundos


class TokenInvalido(Exception):
    pass


def decodificar_access_token(token: str) -> int:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.PyJWTError as exc:
        raise TokenInvalido from exc
    if payload.get("type") != "access":
        raise TokenInvalido
    try:
        return int(payload["sub"])
    except (KeyError, ValueError) as exc:
        raise TokenInvalido from exc


def gerar_refresh_token() -> str:
    """Refresh token opaco. Só o hash SHA-256 é gravado no banco."""
    return secrets.token_urlsafe(48)


def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()
