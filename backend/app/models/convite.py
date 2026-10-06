"""Convites de primeiro acesso (página Colaboradores).

A conta convidada nasce inativa e com `usuarios.convite_pendente`: não entra no sistema até definir a senha
pelo link. Do token só se guarda o hash (SHA-256); o valor bruto existe apenas no e-mail. Um convite novo
(reenvio) substitui o anterior, que deixa de valer.
"""

import enum
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, BigIntPK
from app.models.enums import pg_enum
from app.models.envio_email import EnvioEmail
from app.models.usuario import Usuario


class Convite(Base):
    __tablename__ = "usuario_convites"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    usuario_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    criado_por_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("usuarios.id"), nullable=False, index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expira_em: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    usado_em: Mapped[datetime | None] = mapped_column(DateTime)  # senha definida (conta ativada)
    cancelado_em: Mapped[datetime | None] = mapped_column(DateTime)
    substituido_em: Mapped[datetime | None] = mapped_column(DateTime)  # reenviado: este link deixou de valer
    envio_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("envios_email.id", ondelete="SET NULL"))

    usuario: Mapped[Usuario] = relationship(foreign_keys=[usuario_id])
    criado_por: Mapped[Usuario] = relationship(foreign_keys=[criado_por_id])
    envio: Mapped[EnvioEmail | None] = relationship()


class EventoConvite(str, enum.Enum):
    CADASTRO = "cadastro"
    ENVIO = "envio"
    REENVIO = "reenvio"
    CANCELAMENTO = "cancelamento"
    ATIVACAO = "ativacao"


class ConviteEvento(Base):
    """Auditoria do convite. Nunca guarda senha nem token."""

    __tablename__ = "usuario_convite_eventos"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    convite_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("usuario_convites.id", ondelete="CASCADE"), nullable=False, index=True)
    usuario_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    evento: Mapped[EventoConvite] = mapped_column(pg_enum(EventoConvite, "evento_convite"), nullable=False)
    autor_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("usuarios.id"))  # None = o próprio convidado
    detalhe: Mapped[str | None] = mapped_column(String(500))
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    autor: Mapped[Usuario | None] = relationship(foreign_keys=[autor_id])
