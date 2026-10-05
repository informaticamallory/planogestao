import enum
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    SmallInteger,
    String,
    UniqueConstraint,
    func,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, BigIntPK, TimestampMixin
from app.models.enums import ReferenciaNotificacao, pg_enum
from app.models.usuario import Usuario


class GatilhoPontuacao(str, enum.Enum):
    """Momento do sistema que gera pontos. O código decide o gatilho; a tabela decide pontos e nomes."""

    PLANO_CONCLUIDO = "plano_concluido"  # para o responsável (gestor) do plano
    ACAO_NO_PRAZO = "acao_no_prazo"  # para o responsável (executor) da ação
    ACAO_FORA_DO_PRAZO = "acao_fora_do_prazo"  # idem, entregue depois do prazo


class CategoriaPontuacao(str, enum.Enum):
    """Papel no trabalho (não o perfil de acesso): quem responde pelo plano ou executa a ação."""

    GESTOR = "gestor"
    EXECUTOR = "executor"


CATEGORIA_DO_GATILHO = {
    GatilhoPontuacao.PLANO_CONCLUIDO: CategoriaPontuacao.GESTOR,
    GatilhoPontuacao.ACAO_NO_PRAZO: CategoriaPontuacao.EXECUTOR,
    GatilhoPontuacao.ACAO_FORA_DO_PRAZO: CategoriaPontuacao.EXECUTOR,
}


class SituacaoLancamento(str, enum.Enum):
    VALIDO = "valido"
    REVERTIDO = "revertido"


class OrigemLancamento(str, enum.Enum):
    AUTOMATICO = "automatico"  # na conclusão do plano/ação
    RECALCULO = "recalculo"  # conclusão sem lançamento encontrada ao recalcular a apuração
    CORRECAO = "correcao"  # "Recalcular item" na auditoria (responsável/prazo mudou)
    REGULARIZACAO = "regularizacao"  # data de conclusão informada para um registro antigo
    MIGRACAO = "migracao"  # lançamento anterior às regras de apuração (0023)


class SituacaoPeriodo(str, enum.Enum):
    PLANEJADO = "planejado"
    ABERTO = "aberto"
    ENCERRADO = "encerrado"


class EventoAuditoria(str, enum.Enum):
    REVERSAO = "reversao"  # item reaberto: pontuação revertida
    MANTIDO = "mantido"  # item reaberto, mas a pontuação é de período encerrado: mantida
    RECALCULO = "recalculo"
    CORRECAO = "correcao"
    REGULARIZACAO = "regularizacao"
    ENCERRAMENTO = "encerramento"
    REABERTURA = "reabertura"
    PERIODO = "periodo"  # criação/alteração/exclusão de período
    PREMIOS = "premios"


class GamificacaoRegra(TimestampMixin, Base):
    __tablename__ = "gamificacao_regras"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    gatilho: Mapped[GatilhoPontuacao] = mapped_column(pg_enum(GatilhoPontuacao, "gatilho_pontuacao"), unique=True, nullable=False)
    nome: Mapped[str] = mapped_column(String(100), nullable=False)
    descricao: Mapped[str] = mapped_column(String(300), nullable=False)
    # Texto exibido no card: a quem os pontos se aplicam.
    aplica_a: Mapped[str] = mapped_column(String(100), nullable=False)
    pontos: Mapped[int] = mapped_column(Integer, nullable=False)
    ativo: Mapped[bool] = mapped_column(Boolean, server_default=true(), nullable=False)
    ordem: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)


class GamificacaoLancamento(Base):
    """Extrato de pontos. Gravado no momento da conclusão com tudo que a auditoria precisa (participante,
    data efetiva, prazo considerado, regra e pontos daquele momento); não é recalculado em silêncio.

    Um item (plano ou ação) tem no máximo UM lançamento válido: `chave_valida` = "tipo:id" enquanto válido
    e NULL depois de revertido (o MySQL aceita vários NULL num índice único). Reverter não apaga: o
    lançamento fica como histórico, com quem/quando/por quê.
    """

    __tablename__ = "gamificacao_lancamentos"
    __table_args__ = (Index("ix_gamificacao_lancamentos_ocorrido_usuario", "ocorrido_em", "usuario_id"),)

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    regra_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("gamificacao_regras.id"), nullable=False, index=True)
    gatilho: Mapped[GatilhoPontuacao] = mapped_column(pg_enum(GatilhoPontuacao, "gatilho_pontuacao"), nullable=False)
    categoria: Mapped[CategoriaPontuacao] = mapped_column(pg_enum(CategoriaPontuacao, "categoria_pontuacao"), nullable=False)
    usuario_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    pontos: Mapped[int] = mapped_column(Integer, nullable=False)
    regra_nome: Mapped[str] = mapped_column(String(100), nullable=False)
    referencia_tipo: Mapped[ReferenciaNotificacao] = mapped_column(pg_enum(ReferenciaNotificacao, "referencia_notificacao"), nullable=False)
    referencia_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    plano_id: Mapped[int] = mapped_column(BigInteger, nullable=False, index=True)
    # Data efetiva da conclusão (UTC): é por ela que o período de apuração filtra.
    ocorrido_em: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    # Prazo usado para classificar a ação (no prazo/fora); None para plano.
    prazo_considerado: Mapped[date | None] = mapped_column(Date)
    situacao: Mapped[SituacaoLancamento] = mapped_column(
        pg_enum(SituacaoLancamento, "situacao_lancamento"), nullable=False, default=SituacaoLancamento.VALIDO
    )
    chave_valida: Mapped[str | None] = mapped_column(String(40), unique=True)
    origem: Mapped[OrigemLancamento] = mapped_column(
        pg_enum(OrigemLancamento, "origem_lancamento"), nullable=False, default=OrigemLancamento.AUTOMATICO
    )
    criado_por_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("usuarios.id"))  # None = sistema
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    revertido_em: Mapped[datetime | None] = mapped_column(DateTime)
    revertido_por_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("usuarios.id"))
    motivo_reversao: Mapped[str | None] = mapped_column(String(500))

    regra: Mapped[GamificacaoRegra] = relationship()
    usuario: Mapped[Usuario] = relationship(foreign_keys=[usuario_id])


class GamificacaoPeriodo(TimestampMixin, Base):
    """Período de apuração (inicialmente trimestres civis). Datas locais (America/Sao_Paulo), inclusivas."""

    __tablename__ = "gamificacao_periodos"
    __table_args__ = (UniqueConstraint("nome", name="uq_gamificacao_periodos_nome"),)

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(60), nullable=False)
    ano: Mapped[int] = mapped_column(SmallInteger, nullable=False, index=True)
    data_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    data_fim: Mapped[date] = mapped_column(Date, nullable=False)
    situacao: Mapped[SituacaoPeriodo] = mapped_column(
        pg_enum(SituacaoPeriodo, "situacao_periodo"), nullable=False, default=SituacaoPeriodo.PLANEJADO
    )
    encerrado_em: Mapped[datetime | None] = mapped_column(DateTime)
    encerrado_por_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("usuarios.id"))

    premios: Mapped[list["GamificacaoPremio"]] = relationship(
        back_populates="periodo", cascade="all, delete-orphan", order_by="(GamificacaoPremio.categoria, GamificacaoPremio.colocacao)"
    )


class GamificacaoPremio(TimestampMixin, Base):
    __tablename__ = "gamificacao_premios"
    __table_args__ = (UniqueConstraint("periodo_id", "categoria", "colocacao", name="uq_gamificacao_premios_colocacao"),)

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    periodo_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("gamificacao_periodos.id", ondelete="CASCADE"), nullable=False)
    categoria: Mapped[CategoriaPontuacao] = mapped_column(pg_enum(CategoriaPontuacao, "categoria_pontuacao"), nullable=False)
    colocacao: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    nome: Mapped[str] = mapped_column(String(100), nullable=False)
    descricao: Mapped[str | None] = mapped_column(String(500))
    valor: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))

    periodo: Mapped[GamificacaoPeriodo] = relationship(back_populates="premios")


class GamificacaoFotografia(Base):
    """Resultado congelado no encerramento: lançamentos, participantes, regras e prêmios daquele momento.
    Reabrir o período marca a fotografia como substituída (ela continua guardada)."""

    __tablename__ = "gamificacao_fotografias"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    periodo_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("gamificacao_periodos.id", ondelete="CASCADE"), nullable=False, index=True)
    dados: Mapped[dict] = mapped_column(JSON, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    criado_por_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("usuarios.id"))
    substituida_em: Mapped[datetime | None] = mapped_column(DateTime)


class GamificacaoAuditoria(Base):
    """Histórico de reversões, recálculos, correções, regularizações, encerramentos e reaberturas."""

    __tablename__ = "gamificacao_auditoria"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    evento: Mapped[EventoAuditoria] = mapped_column(pg_enum(EventoAuditoria, "evento_auditoria_gamificacao"), nullable=False, index=True)
    periodo_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("gamificacao_periodos.id", ondelete="SET NULL"), index=True)
    lancamento_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("gamificacao_lancamentos.id"))
    referencia_tipo: Mapped[ReferenciaNotificacao | None] = mapped_column(pg_enum(ReferenciaNotificacao, "referencia_notificacao"))
    referencia_id: Mapped[int | None] = mapped_column(BigInteger)
    autor_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("usuarios.id"))  # None = sistema
    justificativa: Mapped[str | None] = mapped_column(String(500))
    detalhe: Mapped[str] = mapped_column(String(1000), nullable=False)
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False, index=True)

    autor: Mapped[Usuario | None] = relationship()
