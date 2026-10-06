from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy.orm import Session

from app.core.config import get_settings
from sqlalchemy import update

from app.core.security import (
    criar_access_token,
    gerar_refresh_token,
    hash_refresh_token,
    hash_senha,
    utcnow,
    verificar_senha,
)
from app.models import RefreshToken, Usuario
from app.repositories.refresh_token_repository import RefreshTokenRepository
from app.repositories.usuario_repository import UsuarioRepository
from app.schemas.auth import ReferenciaSimples, UsuarioLogado


class CredenciaisInvalidas(Exception):
    pass


class SessaoInvalida(Exception):
    pass


class SenhaAtualIncorreta(Exception):
    pass


@dataclass
class SessaoEmitida:
    usuario: Usuario
    access_token: str
    expires_in: int
    refresh_token: str


def montar_usuario_logado(usuario: Usuario) -> UsuarioLogado:
    return UsuarioLogado(
        id=usuario.id,
        nome=usuario.nome,
        email=usuario.email,
        avatar_url=usuario.avatar_url,
        perfil=ReferenciaSimples.model_validate(usuario.perfil),
        area=ReferenciaSimples.model_validate(usuario.area) if usuario.area else None,
        setor=ReferenciaSimples.model_validate(usuario.setor) if usuario.setor else None,
        permissoes=sorted(usuario.codigos_permissao),
        tema=usuario.tema,
        cor_destaque=usuario.cor_destaque,
        tamanho_fonte=usuario.tamanho_fonte,
    )


class AuthService:
    def __init__(self, db: Session):
        self.db = db
        self.usuarios = UsuarioRepository(db)
        self.tokens = RefreshTokenRepository(db)

    def login(self, email: str, senha: str, user_agent: str | None) -> SessaoEmitida:
        usuario = self.usuarios.obter_por_email(email)
        senha_ok = verificar_senha(senha, usuario.senha_hash if usuario else None)
        if usuario is None or not senha_ok or not usuario.ativo:
            raise CredenciaisInvalidas

        usuario.ultimo_login_em = utcnow()
        sessao = self._emitir(usuario, user_agent)
        self.db.commit()
        return sessao

    def renovar(self, refresh_token: str, user_agent: str | None) -> SessaoEmitida:
        """Rotação: o refresh token usado é revogado e um novo é emitido."""
        agora = utcnow()
        registro = self.tokens.obter_por_hash(hash_refresh_token(refresh_token), bloquear=True)
        if registro is None or registro.revogado_em is not None or registro.expira_em <= agora:
            raise SessaoInvalida

        usuario = self.usuarios.obter_por_id(registro.usuario_id)
        if usuario is None or not usuario.ativo:
            raise SessaoInvalida

        registro.revogado_em = agora
        sessao = self._emitir(usuario, user_agent)
        self.db.commit()
        return sessao

    def iniciar_sessao(self, usuario: Usuario, user_agent: str | None) -> SessaoEmitida:
        """Sessão para quem acabou de ativar a conta pelo convite (mesmo mecanismo do login). Faz o commit."""
        sessao = self._emitir(usuario, user_agent)
        self.db.commit()
        return sessao

    def logout(self, refresh_token: str | None) -> None:
        if not refresh_token:
            return
        registro = self.tokens.obter_por_hash(hash_refresh_token(refresh_token))
        if registro is not None and registro.revogado_em is None:
            registro.revogado_em = utcnow()
            self.db.commit()

    def trocar_senha(self, usuario: Usuario, senha_atual: str, nova_senha: str, user_agent: str | None) -> SessaoEmitida:
        """Troca feita pelo próprio usuário. Encerra as sessões de todos os dispositivos e emite uma nova
        para quem trocou, que continua logado. (Access tokens já emitidos valem até expirar.)"""
        if not verificar_senha(senha_atual, usuario.senha_hash):
            raise SenhaAtualIncorreta
        usuario.senha_hash = hash_senha(nova_senha)
        self.db.execute(
            update(RefreshToken)
            .where(RefreshToken.usuario_id == usuario.id, RefreshToken.revogado_em.is_(None))
            .values(revogado_em=utcnow())
        )
        sessao = self._emitir(usuario, user_agent)
        self.db.commit()
        return sessao

    def _emitir(self, usuario: Usuario, user_agent: str | None) -> SessaoEmitida:
        settings = get_settings()
        access_token, expires_in = criar_access_token(usuario.id)
        refresh_token = gerar_refresh_token()
        self.tokens.criar(
            usuario_id=usuario.id,
            token_hash=hash_refresh_token(refresh_token),
            expira_em=utcnow() + timedelta(days=settings.REFRESH_TOKEN_EXPIRATION_DAYS),
            user_agent=user_agent,
        )
        return SessaoEmitida(usuario, access_token, expires_in, refresh_token)
