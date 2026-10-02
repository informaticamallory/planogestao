from datetime import datetime

from sqlalchemy import CHAR, DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BigIntPK


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    usuario_id: Mapped[int] = mapped_column(
        BigIntPK, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # SHA-256 do token; o valor original nunca é gravado.
    token_hash: Mapped[str] = mapped_column(CHAR(64), unique=True, nullable=False)
    expira_em: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revogado_em: Mapped[datetime | None] = mapped_column(DateTime)
    user_agent: Mapped[str | None] = mapped_column(String(255))
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
