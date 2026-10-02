from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String, Text, UniqueConstraint, func, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, BigIntPK


class Equipe(Base):
    """Equipe de trabalho (independente do setor: um usuário pode estar em várias equipes)."""

    __tablename__ = "equipes"
    __table_args__ = (UniqueConstraint("area_id", "nome", name="uq_equipes_area_nome"),)

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(100), nullable=False)
    area_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("areas.id", ondelete="RESTRICT"), nullable=False, index=True)
    setor_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("setores.id", ondelete="SET NULL"))
    supervisor_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("usuarios.id", ondelete="RESTRICT"), nullable=False, index=True)
    descricao: Mapped[str | None] = mapped_column(Text)
    ativo: Mapped[bool] = mapped_column(Boolean, server_default=true(), nullable=False)
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    area = relationship("Area", lazy="joined")
    setor = relationship("Setor", lazy="joined")
    supervisor = relationship("Usuario", lazy="joined", foreign_keys=[supervisor_id])
    membros: Mapped[list["EquipeMembro"]] = relationship(back_populates="equipe", cascade="all, delete-orphan", passive_deletes=True)


class EquipeMembro(Base):
    __tablename__ = "equipe_membros"

    equipe_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("equipes.id", ondelete="CASCADE"), primary_key=True)
    usuario_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True, index=True)
    papel_na_equipe: Mapped[str | None] = mapped_column(String(60))
    data_entrada: Mapped[date] = mapped_column(Date, nullable=False)

    equipe: Mapped[Equipe] = relationship(back_populates="membros")
    usuario = relationship("Usuario", lazy="joined")
