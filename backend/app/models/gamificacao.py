import enum
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Index, Integer, SmallInteger, String, UniqueConstraint, func, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, BigIntPK, TimestampMixin
from app.models.enums import ReferenciaNotificacao, pg_enum
from app.models.usuario import Usuario


class GatilhoPontuacao(str, enum.Enum):
    """Momento do sistema que gera pontos. O código decide o gatilho; a tabela decide pontos e nomes."""

    PLANO_CONCLUIDO = "plano_concluido"  # para o responsável (gestor) do plano
    ACAO_NO_PRAZO = "acao_no_prazo"  # para o responsável (executor) da ação
    ACAO_FORA_DO_PRAZO = "acao_fora_do_prazo"  # idem, entregue depois do prazo


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
    """Extrato de pontos. Gravado pelos services no momento da conclusão; nunca recalculado.

    Guarda os pontos do momento: alterar uma regra não muda o que já foi creditado.
    Regra inativa gera lançamento com 0 pontos, para as contagens (no prazo/atrasadas) continuarem completas.
    """

    __tablename__ = "gamificacao_lancamentos"
    __table_args__ = (
        # Cada plano/ação credita cada colaborador uma única vez (conclusão é definitiva).
        UniqueConstraint("referencia_tipo", "referencia_id", "usuario_id", name="uq_gamificacao_lancamentos_referencia_usuario"),
        Index("ix_gamificacao_lancamentos_ocorrido_usuario", "ocorrido_em", "usuario_id"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    regra_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("gamificacao_regras.id"), nullable=False, index=True)
    gatilho: Mapped[GatilhoPontuacao] = mapped_column(pg_enum(GatilhoPontuacao, "gatilho_pontuacao"), nullable=False)
    usuario_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False, index=True)
    pontos: Mapped[int] = mapped_column(Integer, nullable=False)
    referencia_tipo: Mapped[ReferenciaNotificacao] = mapped_column(pg_enum(ReferenciaNotificacao, "referencia_notificacao"), nullable=False)
    referencia_id: Mapped[int] = mapped_column(BigInteger, nullable=False)
    # Momento da conclusão (UTC): é por ele que o período do painel filtra.
    ocorrido_em: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    regra: Mapped[GamificacaoRegra] = relationship()
    usuario: Mapped[Usuario] = relationship()
