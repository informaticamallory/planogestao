from datetime import date, datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Table,
    Text,
    false,
    func,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, BigIntPK, TimestampMixin
from app.models.enums import EventoPlano, Prioridade, StatusPlano, pg_enum
from app.models.estrutura import Area, Setor
from app.models.usuario import Usuario


# Compatibilidade Tipo ↔ Origem (N:N): quais origens fazem sentido para cada tipo de plano.
tipo_origem = Table(
    "tipo_origem",
    Base.metadata,
    Column("tipo_plano_id", BigIntPK, ForeignKey("tipos_plano.id", ondelete="CASCADE"), primary_key=True),
    Column("origem_id", BigIntPK, ForeignKey("origens_plano.id", ondelete="CASCADE"), primary_key=True, index=True),
)


class OrigemPlano(TimestampMixin, Base):
    """Cadastro de origens (Administração). Tabela `origens_plano` desde a Fase 0."""

    __tablename__ = "origens_plano"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, server_default=true(), nullable=False)


class TipoPlano(TimestampMixin, Base):
    __tablename__ = "tipos_plano"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, server_default=true(), nullable=False)

    origens: Mapped[list[OrigemPlano]] = relationship(secondary=tipo_origem, order_by=OrigemPlano.nome)


class PlanoSequencia(Base):
    """Último número de plano emitido por ano (código PA-AAAA-NNNN)."""

    __tablename__ = "plano_sequencia"

    ano: Mapped[int] = mapped_column(SmallInteger, primary_key=True, autoincrement=False)
    ultimo_numero: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


class PlanoDeAcao(TimestampMixin, Base):
    __tablename__ = "planos_de_acao"
    # Filtro de período do dashboard e das listagens.
    __table_args__ = (Index("ix_planos_de_acao_criado_em", "criado_em"),)

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    codigo: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    nome: Mapped[str] = mapped_column(String(200), nullable=False)
    tipo_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("tipos_plano.id"), nullable=False, index=True)
    origem_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("origens_plano.id"), nullable=False, index=True)
    area_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("areas.id"), nullable=False, index=True)
    setor_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("setores.id"), index=True)
    responsavel_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("usuarios.id"), nullable=False, index=True)
    criado_por_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("usuarios.id"), nullable=False, index=True)
    # Datas estimadas de início e de fim (datas de negócio); criado_em é o registro de auditoria.
    data_inicio_estimado: Mapped[date] = mapped_column(Date, nullable=False)
    data_fim_estimado: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    prioridade: Mapped[Prioridade] = mapped_column(pg_enum(Prioridade, "prioridade"), nullable=False)
    status: Mapped[StatusPlano] = mapped_column(
        pg_enum(StatusPlano, "status_plano"), nullable=False, default=StatusPlano.NAO_INICIADO, index=True
    )
    # Rascunho é uma condição à parte do status: etapas 2 e 3 opcionais e ninguém é avisado ainda.
    rascunho: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    descricao: Mapped[str | None] = mapped_column(Text)
    descricao_problema: Mapped[str | None] = mapped_column(Text)
    objetivo: Mapped[str | None] = mapped_column(Text)
    causa: Mapped[str | None] = mapped_column(Text)
    evidencias: Mapped[str | None] = mapped_column(Text)
    observacoes: Mapped[str | None] = mapped_column(Text)
    concluido_em: Mapped[datetime | None] = mapped_column(DateTime)
    # Arquivamento é reversível e substitui a exclusão (o histórico precisa ser preservado).
    arquivado_em: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    arquivado_por_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("usuarios.id"))

    tipo: Mapped[TipoPlano] = relationship()
    origem: Mapped[OrigemPlano] = relationship()
    area: Mapped[Area] = relationship()
    setor: Mapped[Setor | None] = relationship()
    responsavel: Mapped[Usuario] = relationship(foreign_keys=[responsavel_id])
    criado_por: Mapped[Usuario] = relationship(foreign_keys=[criado_por_id])
    arquivado_por: Mapped[Usuario | None] = relationship(foreign_keys=[arquivado_por_id])
    acoes: Mapped[list["Acao"]] = relationship(back_populates="plano")  # noqa: F821
    anexos: Mapped[list["PlanoAnexo"]] = relationship(back_populates="plano", order_by="PlanoAnexo.criado_em")


class PlanoAnexo(Base):
    __tablename__ = "plano_anexos"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    plano_id: Mapped[int] = mapped_column(
        BigIntPK, ForeignKey("planos_de_acao.id", ondelete="CASCADE"), nullable=False, index=True
    )
    nome_arquivo: Mapped[str] = mapped_column(String(255), nullable=False)
    # Chave no armazenamento (ex.: "planos/12/3f2a....pdf"); nunca exposta como URL pública.
    chave_armazenamento: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    mime_type: Mapped[str] = mapped_column(String(150), nullable=False)
    tamanho_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    enviado_por_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("usuarios.id"), nullable=False)
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    plano: Mapped[PlanoDeAcao] = relationship(back_populates="anexos")
    enviado_por: Mapped[Usuario] = relationship()


class PlanoHistorico(Base):
    """Auditoria do plano. Para campos de relacionamento (área, responsável...) grava o nome, legível."""

    __tablename__ = "plano_historico"
    __table_args__ = (Index("ix_plano_historico_plano_criado", "plano_id", "criado_em"),)

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    plano_id: Mapped[int] = mapped_column(
        BigIntPK, ForeignKey("planos_de_acao.id", ondelete="CASCADE"), nullable=False
    )
    # Null = alteração automática do sistema (ex.: "Não iniciado" → "Em andamento" na 1ª ação aceita).
    usuario_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("usuarios.id"))
    evento: Mapped[EventoPlano] = mapped_column(pg_enum(EventoPlano, "evento_plano"), nullable=False)
    campo_alterado: Mapped[str | None] = mapped_column(String(50))
    valor_anterior: Mapped[str | None] = mapped_column(Text)
    valor_novo: Mapped[str | None] = mapped_column(Text)
    motivo: Mapped[str | None] = mapped_column(String(200))
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    plano: Mapped[PlanoDeAcao] = relationship()
    usuario: Mapped[Usuario | None] = relationship()
