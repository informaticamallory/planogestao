from datetime import datetime

from sqlalchemy import BigInteger, DateTime, MetaData, func
from sqlalchemy.dialects import mysql
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Nomes de constraints previsíveis, para as migrations do Alembic serem estáveis.
NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}

# BIGINT UNSIGNED no MySQL (e BIGINT em outros dialetos).
BigIntPK = BigInteger().with_variant(mysql.BIGINT(unsigned=True), "mysql")


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class TimestampMixin:
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    atualizado_em: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now(), nullable=False
    )
