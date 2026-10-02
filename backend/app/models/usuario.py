from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, BigIntPK, TimestampMixin
from app.models.estrutura import Area, Setor
from app.models.perfil import Perfil


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

    perfil: Mapped[Perfil] = relationship(lazy="joined")
    area: Mapped[Area | None] = relationship(lazy="joined")
    setor: Mapped[Setor | None] = relationship(lazy="joined")

    @property
    def codigos_permissao(self) -> set[str]:
        return {p.codigo for p in self.perfil.permissoes}
