from sqlalchemy import Column, ForeignKey, String, Table
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, BigIntPK

perfil_permissao = Table(
    "perfil_permissao",
    Base.metadata,
    Column("perfil_id", BigIntPK, ForeignKey("perfis.id", ondelete="CASCADE"), primary_key=True),
    Column("permissao_id", BigIntPK, ForeignKey("permissoes.id", ondelete="CASCADE"), primary_key=True),
)


class Permissao(Base):
    __tablename__ = "permissoes"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    codigo: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)
    modulo: Mapped[str] = mapped_column(String(50), nullable=False)
    # Coluna da matriz de perfis: visualizar | criar | editar | excluir | aprovar | outra.
    acao: Mapped[str] = mapped_column(String(20), nullable=False, server_default="outra")
    descricao: Mapped[str | None] = mapped_column(String(255))


class Perfil(Base):
    __tablename__ = "perfis"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    descricao: Mapped[str | None] = mapped_column(String(255))

    permissoes: Mapped[list[Permissao]] = relationship(secondary=perfil_permissao, lazy="selectin")
