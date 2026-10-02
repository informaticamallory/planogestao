"""Dependencies de autenticação e autorização, reutilizáveis em todas as rotas.

Uso:
    @router.get("/admin", dependencies=[Depends(require_role(["Administrador"]))])
    def rota(usuario: Usuario = Depends(require_permission("planos:criar"))): ...
"""

from collections.abc import Callable, Iterable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.permissoes import PERFIL_ADMINISTRADOR
from app.core.security import TokenInvalido, decodificar_access_token
from app.models import Usuario
from app.repositories.usuario_repository import UsuarioRepository

_bearer = HTTPBearer(auto_error=False)

_NAO_AUTENTICADO = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Não autenticado.",
    headers={"WWW-Authenticate": "Bearer"},
)


def get_current_user(
    credenciais: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> Usuario:
    if credenciais is None:
        raise _NAO_AUTENTICADO
    try:
        usuario_id = decodificar_access_token(credenciais.credentials)
    except TokenInvalido:
        raise _NAO_AUTENTICADO from None

    usuario = UsuarioRepository(db).obter_por_id(usuario_id)
    if usuario is None or not usuario.ativo:
        raise _NAO_AUTENTICADO
    return usuario


def _proibido() -> HTTPException:
    return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Acesso negado para o seu perfil.")


def require_role(perfis: Iterable[str]) -> Callable[..., Usuario]:
    """Permite acesso apenas aos perfis informados (pelo nome, ex. "Gestor")."""
    permitidos = frozenset(perfis)

    def dependency(usuario: Usuario = Depends(get_current_user)) -> Usuario:
        if usuario.perfil.nome not in permitidos:
            raise _proibido()
        return usuario

    return dependency


def require_permission(*codigos: str) -> Callable[..., Usuario]:
    """Exige que o perfil do usuário tenha TODAS as permissões informadas."""
    exigidas = frozenset(codigos)

    def dependency(usuario: Usuario = Depends(get_current_user)) -> Usuario:
        if not exigidas <= usuario.codigos_permissao:
            raise _proibido()
        return usuario

    return dependency


# Módulo Administração: exclusivo do perfil Administrador, verificado pelo nome do perfil.
# Decisão documentada: o Gestor NÃO tem acesso parcial (ex.: usuários da própria área), porque
# isso permitiria criar usuários ou atribuir perfis acima do seu — escalada de privilégio.
require_admin = require_role([PERFIL_ADMINISTRADOR])