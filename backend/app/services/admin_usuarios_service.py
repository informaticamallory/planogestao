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
    # A foto saiu do formulário web: só é gravada quando o campo vem na requisição (não apaga a existente).
    alterar_avatar: bool = False
    # Áreas autorizadas. None = não enviado (mantém; na criação, usa a lotação).
    todas_areas: bool | None = None
    areas_autorizadas: list[int] | None = None


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
        if dados.areas_autorizadas is not None:
            ids = set(dados.areas_autorizadas)
            atuais = {a.id for a in usuario.areas_autorizadas} if usuario else set()
            encontradas = {a.id: a for a in self.db.scalars(select(Area).where(Area.id.in_(ids)))} if ids else {}
            if ids - encontradas.keys():
                raise RegraInvalida("Área autorizada inexistente.")
            # Área inativa só fica se já estava autorizada (não se concede acesso novo a ela).
            if any(not a.ativo and a.id not in atuais for a in encontradas.values()):
                raise RegraInvalida("Não é possível autorizar uma área inativa.")
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

    def _aplicar_areas(self, usuario: Usuario, dados: DadosUsuario) -> None:
        if dados.todas_areas is not None:
            usuario.todas_areas = dados.todas_areas
        if dados.areas_autorizadas is not None:
            ids = sorted(set(dados.areas_autorizadas))
            usuario.areas_autorizadas = list(self.db.scalars(select(Area).where(Area.id.in_(ids)))) if ids else []
        elif not usuario.areas_autorizadas and usuario.id is None and usuario.area_id is not None:
            # Criação sem áreas informadas (ex.: app mobile): começa pela lotação.
            usuario.areas_autorizadas = [self.db.get(Area, usuario.area_id)]

    def pendencias_areas(self) -> dict:
        """Para o Administrador regularizar: usuários sem área autorizada e atribuições fora das áreas."""
        from app.models import Acao, PlanoDeAcao
        from app.models.enums import STATUS_ACAO_DESCARTADOS

        restritos = [u for u in self.db.scalars(select(Usuario).where(Usuario.ativo.is_(True)).order_by(Usuario.nome))
                     if u.areas_de_acesso is not None]
        sem_area = [u for u in restritos if not u.areas_de_acesso]
        atribuicoes: list[dict] = []
        for u in restritos:
            areas = u.areas_de_acesso
            fora = PlanoDeAcao.area_id.not_in(sorted(areas)) if areas else True
            for p in self.db.scalars(select(PlanoDeAcao).where(
                PlanoDeAcao.responsavel_id == u.id, PlanoDeAcao.arquivado_em.is_(None), fora
            ).order_by(PlanoDeAcao.codigo)):
                atribuicoes.append(dict(usuario=u, papel="Responsável pelo plano", plano=p, acao=None))
            for a in self.db.scalars(select(Acao).join(PlanoDeAcao, Acao.plano_id == PlanoDeAcao.id).where(
                Acao.responsavel_id == u.id, Acao.status.not_in(STATUS_ACAO_DESCARTADOS), PlanoDeAcao.arquivado_em.is_(None), fora
            ).order_by(PlanoDeAcao.codigo, Acao.id)):
                papel = "Responsável por sub-item" if a.acao_pai_id else "Responsável por ação"
                atribuicoes.append(dict(usuario=u, papel=papel, plano=a.plano, acao=a))
        return dict(sem_area=sem_area, atribuicoes=atribuicoes)

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
            area_id=dados.area_id, setor_id=dados.setor_id, ativo=dados.ativo,
            avatar_url=dados.avatar_url if dados.alterar_avatar else None,
        )
        self._aplicar_areas(usuario, dados)
        self.db.add(usuario)
        self._commit()
        self.db.refresh(usuario)
        return usuario

    def atualizar(self, usuario_id: int, dados: DadosUsuario) -> Usuario:
        usuario = self._obter(usuario_id)
        perfil = self._validar(dados, usuario)
        self._proteger_administradores(usuario, perfil, dados.ativo)

        if usuario.convite_pendente and dados.ativo and not usuario.ativo:
            if not dados.senha:
                raise RegraInvalida(
                    "Esta conta aguarda o primeiro acesso pelo convite. Para ativá-la aqui, defina uma senha (o link do convite deixa de valer)."
                )
            # Ativada pelo Administrador: o convite pendente deixa de valer.
            from app.models import Convite

            for c in self.db.scalars(select(Convite).where(Convite.usuario_id == usuario.id, Convite.usado_em.is_(None),
                                                           Convite.cancelado_em.is_(None), Convite.substituido_em.is_(None))):
                c.cancelado_em = utcnow()
            usuario.convite_pendente = False
        revogar = (usuario.ativo and not dados.ativo) or usuario.perfil_id != dados.perfil_id or bool(dados.senha)
        usuario.nome, usuario.email, usuario.perfil_id = dados.nome, dados.email, dados.perfil_id
        usuario.area_id, usuario.setor_id = dados.area_id, dados.setor_id
        usuario.ativo = dados.ativo
        if dados.alterar_avatar:
            usuario.avatar_url = dados.avatar_url
        self._aplicar_areas(usuario, dados)
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
