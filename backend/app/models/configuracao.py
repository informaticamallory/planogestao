from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, BigIntPK
from app.models.usuario import Usuario


class Configuracao(Base):
    """Parâmetro global do sistema. As chaves válidas (tipo, limites, padrão) estão em services/configuracoes.py."""

    __tablename__ = "configuracoes"

    chave: Mapped[str] = mapped_column(String(80), primary_key=True)
    valor: Mapped[str] = mapped_column(String(255), nullable=False)
    atualizado_por_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("usuarios.id", ondelete="SET NULL"))
    atualizado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    atualizado_por: Mapped[Usuario | None] = relationship()
