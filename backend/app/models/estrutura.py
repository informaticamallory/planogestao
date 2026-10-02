from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, BigIntPK, TimestampMixin


class Area(TimestampMixin, Base):
    __tablename__ = "areas"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, server_default=true(), nullable=False)

    setores: Mapped[list["Setor"]] = relationship(back_populates="area")


class Setor(TimestampMixin, Base):
    __tablename__ = "setores"
    __table_args__ = (UniqueConstraint("area_id", "nome"),)

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    area_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("areas.id"), nullable=False, index=True)
    nome: Mapped[str] = mapped_column(String(100), nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, server_default=true(), nullable=False)

    area: Mapped[Area] = relationship(back_populates="setores")
