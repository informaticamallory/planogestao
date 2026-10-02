from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, func, true
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BigIntPK


class DeviceToken(Base):
    """Token de push (Expo) de um aparelho. Um token pertence a um usuário por vez."""

    __tablename__ = "device_tokens"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    usuario_id: Mapped[int] = mapped_column(
        BigIntPK, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # "ExponentPushToken[...]". Único: se outro usuário logar no mesmo aparelho, o token passa para ele.
    token: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    plataforma: Mapped[str] = mapped_column(String(10), nullable=False)  # android | ios
    # Desativado no logout ou quando o Expo responde DeviceNotRegistered (app desinstalado).
    ativo: Mapped[bool] = mapped_column(Boolean, server_default=true(), nullable=False)
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
