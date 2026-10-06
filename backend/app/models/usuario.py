from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Table, false, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.permissoes import CODIGOS_CATALOGO, PERFIL_ADMINISTRADOR
from app.models.base import Base, BigIntPK, TimestampMixin
from app.models.estrutura import Area, Setor
from app.models.perfil import Perfil

# Áreas autorizadas (acesso a planos), separadas da lotação (usuarios.area_id). Só o Administrador altera.
usuario_area_autorizada = Table(
    "usuario_area_autorizada",
    Base.metadata,
    Column("usuario_id", BigIntPK, ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True),
    Column("area_id", BigIntPK, ForeignKey("areas.id", ondelete="CASCADE"), primary_key=True, index=True),
)


class Usuario(TimestampMixin, Base):
    __tablename__ = "usuarios"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    senha_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    perfil_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("perfis.id"), nullable=False, index=True)
    area_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("areas.id"), index=True)
    setor_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("setores.id"), index=True)
    ativo: Mapped[bool] = mapped_column(Boolean, server_default=true(), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    ultimo_login_em: Mapped[datetime | None] = mapped_column(DateTime)
    # Preferências do próprio usuário (tela Meu Perfil): acompanham a conta entre dispositivos.
    tema: Mapped[str] = mapped_column(String(12), server_default="automatico", nullable=False)  # claro | escuro | automatico
    cor_destaque: Mapped[str | None] = mapped_column(String(20))  # None = laranja padrão do DS
    # pequeno | padrao | grande | extra_grande (web: font-size da raiz; mobile: escala dos textos)
    tamanho_fonte: Mapped[str] = mapped_column(String(16), server_default="padrao", nullable=False)
    # "Todas as áreas": inclui as cadastradas depois. Sem isso, valem só as de areas_autorizadas.
    todas_areas: Mapped[bool] = mapped_column(Boolean, server_default=false(), default=False, nullable=False)
    # Convidado pela página Colaboradores e ainda sem senha: conta inativa até o primeiro acesso.
    convite_pendente: Mapped[bool] = mapped_column(Boolean, server_default=false(), default=False, nullable=False)

    perfil: Mapped[Perfil] = relationship(lazy="joined")
    area: Mapped[Area | None] = relationship(lazy="joined")
    setor: Mapped[Setor | None] = relationship(lazy="joined")
    areas_autorizadas: Mapped[list[Area]] = relationship(secondary=usuario_area_autorizada, lazy="selectin", order_by=Area.nome)

    @property
    def codigos_permissao(self) -> set[str]:
        codigos = {p.codigo for p in self.perfil.permissoes}
        # O Administrador é fixo e tem sempre acesso total: uma permissão nova do catálogo vale para ele
        # mesmo que a linha em perfil_permissao ainda não exista (migração atrasada ou banco antigo).
        if self.perfil.nome == PERFIL_ADMINISTRADOR:
            codigos |= CODIGOS_CATALOGO
        return codigos

    @property
    def eh_administrador(self) -> bool:
        return self.perfil.nome == PERFIL_ADMINISTRADOR

    @property
    def areas_de_acesso(self) -> set[int] | None:
        """Áreas cujos planos o usuário pode acessar. None = todas (Administrador ou "Todas as áreas")."""
        if self.eh_administrador or self.todas_areas:
            return None
        return {a.id for a in self.areas_autorizadas}

    def acessa_area(self, area_id: int | None) -> bool:
        areas = self.areas_de_acesso
        return areas is None or (area_id is not None and area_id in areas)
