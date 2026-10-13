from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint, func, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, BigIntPK
from app.models.estrutura import Area
from app.models.usuario import Usuario


class ModeloEmail(Base):
    """Modelo editável de um tipo de e-mail (ver services/email_modelos.py). Sem linha = texto padrão, ativo."""

    __tablename__ = "modelos_email"

    evento: Mapped[str] = mapped_column(String(40), primary_key=True)  # plano_criado | acao_criada | subitem_criado
    assunto: Mapped[str] = mapped_column(String(255), nullable=False)
    corpo: Mapped[str] = mapped_column(Text, nullable=False)
    cco: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, server_default=true(), nullable=False)
    atualizado_por_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("usuarios.id", ondelete="SET NULL"))
    atualizado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    atualizado_por: Mapped[Usuario | None] = relationship()


class ConfigEmail(Base):
    """Configuração geral dos e-mails editável na tela (ex.: "cco_padrao"). Credenciais NÃO ficam aqui."""

    __tablename__ = "config_email"

    chave: Mapped[str] = mapped_column(String(40), primary_key=True)
    valor: Mapped[list[str]] = mapped_column(JSON, nullable=False)
    atualizado_por_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("usuarios.id", ondelete="SET NULL"))
    atualizado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    atualizado_por: Mapped[Usuario | None] = relationship()


class GestorAreaEmail(Base):
    """Gestor que recebe, em cópia oculta, os e-mails das notificações de uma área (services/gestores_area.py).
    Só define o recebimento: não dá nem tira acesso. Um gestor pode ter várias áreas e uma área vários gestores;
    o par (área, gestor) é único."""

    __tablename__ = "gestores_area_email"
    __table_args__ = (UniqueConstraint("area_id", "usuario_id"),)

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    area_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("areas.id", ondelete="CASCADE"), nullable=False, index=True)
    usuario_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    ativo: Mapped[bool] = mapped_column(Boolean, server_default=true(), nullable=False)
    atualizado_por_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("usuarios.id", ondelete="SET NULL"))
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    area: Mapped[Area] = relationship()
    usuario: Mapped[Usuario] = relationship(foreign_keys=[usuario_id])
    atualizado_por: Mapped[Usuario | None] = relationship(foreign_keys=[atualizado_por_id])


class HistoricoConfigEmail(Base):
    """Quem alterou o quê nos modelos e nas listas de CCO, e quando (um registro por campo alterado)."""

    __tablename__ = "historico_config_email"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    escopo: Mapped[str] = mapped_column(String(40), nullable=False)  # evento do modelo, "cco_padrao" ou "gestores_area"
    # assunto | corpo | cco | ativo | restaurado; em "gestores_area": vinculo_criado | vinculo_alterado | vinculo_removido
    campo: Mapped[str] = mapped_column(String(40), nullable=False)
    valor_anterior: Mapped[str | None] = mapped_column(Text)
    valor_novo: Mapped[str | None] = mapped_column(Text)
    usuario_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("usuarios.id", ondelete="SET NULL"), index=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    usuario: Mapped[Usuario | None] = relationship()

