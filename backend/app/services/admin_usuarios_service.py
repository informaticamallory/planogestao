"""Gestão de usuários (módulo Administração).

- Usuário nunca é apagado: "excluir" inativa (planos, ações e históricos apontam para ele).
- Inativar, trocar perfil ou redefinir senha revoga as sessões (refresh tokens) do usuário.
  O access token em uso deixa de valer na hora para inativos (get_current_user checa `ativo`).
- Travas contra lockout: o administrador não inativa a si mesmo nem troca o próprio perfil,
  e sempre sobra ao menos um Administrador ativo.
"""

from dataclasses import dataclass

from sqlalchemy import func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.permissoes import PERFIL_ADMINISTRADOR
from app.core.security import hash_senha, utcnow
from app.models import Area, Perfil, RefreshToken, Setor, Usuario
from app.services.erros import Conflito, NaoEncontrado, RegraInvalida


@dataclass
class DadosUsuario:
    nome: str
    email: str
    perfil_id: int
    area_id: int | None
    setor_id: int | None
    ativo: bool
    avatar_url: str | None
    senha: str | None  # obrigatória na criação; na edição, preenchida = redefinir


class UsuariosAdminService:
    def __init__(self, db: Session, admin: Usuario):
        self.db = db
        self.admin = admin

    def _obter(self, usuario_id: int) -> Usuario:
        usuario = self.db.get(Usuario, usuario_id)
        if usuario is None:
            raise NaoEncontrado("Usuário não encontrado.")
        return usuario

    def listar(self, q: str, perfil_id: int | None, area_id: int | None, ativo: bool | None, page: int, page_size: int) -> dict:
        consulta = select(Usuario)
        termo = q.strip()
        if termo:
            consulta = consulta.where(
                or_(Usuario.nome.contains(termo, autoescape=True), Usuario.email.contains(termo, autoescape=True))
            )
        if perfil_id is not None:
            consulta = consulta.where(Usuario.perfil_id == perfil_id)
        if area_id is not None:
            consulta = consulta.where(Usuario.area_id == area_id)
        if ativo is not None:
            consulta = consulta.where(Usuario.ativo.is_(ativo))
        total = self.db.scalar(select(func.count()).select_from(consulta.subquery())) or 0
        itens = self.db.scalars(consulta.order_by(Usuario.nome, Usuario.id).offset((page - 1) * page_size).limit(page_size))
        return dict(items=list(itens), total=total, page=page, page_size=page_size)

    def detalhe(self, usuario_id: int) -> Usuario:
        return self._obter(usuario_id)

    # ---- validações --------------------------------------------------------------------------

    def _validar(self, dados: DadosUsuario, usuario: Usuario | None) -> Perfil:
        perfil = self.db.get(Perfil, dados.perfil_id)
        if perfil is None:
            raise RegraInvalida("Perfil inválido.")
        area = self.db.get(Area, dados.area_id) if dados.area_id is not None else None
        if dados.area_id is not None and (area is None or (not area.ativo and (usuario is None or usuario.area_id != area.id))):
            raise RegraInvalida("Área inválida ou inativa.")
        if dados.setor_id is not None:
            setor = self.db.get(Setor, dados.setor_id)
            if setor is None or (not setor.ativo and (usuario is None or usuario.setor_id != setor.id)):
                raise RegraInvalida("Setor inválido ou inativo.")
            if setor.area_id != dados.area_id:
                raise RegraInvalida("O setor informado não pertence à área selecionada.")
        duplicado = self.db.scalar(
            select(Usuario.id).where(Usuario.email == dados.email, Usuario.id != (usuario.id if usuario else 0))
        )
        if duplicado:
            raise Conflito("Já existe um usuário com este e-mail.")
        return perfil

    def _administradores_ativos(self, exceto_id: int) -> int:
        return self.db.scalar(
            select(func.count(Usuario.id))
            .join(Perfil, Perfil.id == Usuario.perfil_id)
            .where(Perfil.nome == PERFIL_ADMINISTRADOR, Usuario.ativo.is_(True), Usuario.id != exceto_id)
        ) or 0

    def _proteger_administradores(self, usuario: Usuario, perfil_novo: Perfil, ativo_novo: bool) -> None:
        eh_admin = usuario.perfil.nome == PERFIL_ADMINISTRADOR and usuario.ativo
        continua_admin = perfil_novo.nome == PERFIL_ADMINISTRADOR and ativo_novo
        if usuario.id == self.admin.id and not continua_admin:
            raise RegraInvalida("Você não pode inativar a si mesmo nem trocar o seu próprio perfil.")
        if eh_admin and not continua_admin and self._administradores_ativos(usuario.id) == 0:
            raise RegraInvalida("O sistema precisa de pelo menos um Administrador ativo.")

    def _revogar_sessoes(self, usuario_id: int) -> None:
        self.db.execute(
            update(RefreshToken)
            .where(RefreshToken.usuario_id == usuario_id, RefreshToken.revogado_em.is_(None))
            .values(revogado_em=utcnow())
        )

    def _commit(self) -> None:
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            raise Conflito("Já existe um usuário com este e-mail.") from None

    # ---- escrita -----------------------------------------------------------------------------

    def criar(self, dados: DadosUsuario) -> Usuario:
        self._validar(dados, None)
        if not dados.senha:
            raise RegraInvalida("Informe a senha inicial.")
        usuario = Usuario(
            nome=dados.nome, email=dados.email, senha_hash=hash_senha(dados.senha), perfil_id=dados.perfil_id,
            area_id=dados.area_id, setor_id=dados.setor_id, ativo=dados.ativo, avatar_url=dados.avatar_url,
        )
        self.db.add(usuario)
        self._commit()
        self.db.refresh(usuario)
        return usuario

    def atualizar(self, usuario_id: int, dados: DadosUsuario) -> Usuario:
        usuario = self._obter(usuario_id)
        perfil = self._validar(dados, usuario)
        self._proteger_administradores(usuario, perfil, dados.ativo)

        revogar = (usuario.ativo and not dados.ativo) or usuario.perfil_id != dados.perfil_id or bool(dados.senha)
        usuario.nome, usuario.email, usuario.perfil_id = dados.nome, dados.email, dados.perfil_id
        usuario.area_id, usuario.setor_id = dados.area_id, dados.setor_id
        usuario.ativo, usuario.avatar_url = dados.ativo, dados.avatar_url
        if dados.senha:
            usuario.senha_hash = hash_senha(dados.senha)
        if revogar:
            self._revogar_sessoes(usuario.id)
        self._commit()
        self.db.refresh(usuario)
        return usuario

    def inativar(self, usuario_id: int) -> None:
        usuario = self._obter(usuario_id)
        self._proteger_administradores(usuario, usuario.perfil, False)
        usuario.ativo = False
        self._revogar_sessoes(usuario.id)
        self.db.commit()
