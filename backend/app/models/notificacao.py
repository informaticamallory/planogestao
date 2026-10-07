from datetime import date, datetime

from sqlalchemy import BigInteger, Boolean, Date, DateTime, ForeignKey, Index, SmallInteger, String, Text, UniqueConstraint, false, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BigIntPK
from app.models.enums import ReferenciaNotificacao, pg_enum


class Notificacao(Base):
    __tablename__ = "notificacoes"
    __table_args__ = (Index("ix_notificacoes_usuario_lida_criado", "usuario_id", "lida", "criado_em"),)

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    usuario_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("usuarios.id", ondelete="CASCADE"), nullable=False)
    # Ex.: "solicitacao_prazo", "resposta_solicitacao_prazo" (texto livre para crescer sem migration).
    tipo: Mapped[str] = mapped_column(String(50), nullable=False)
    titulo: Mapped[str] = mapped_column(String(200), nullable=False)
    mensagem: Mapped[str] = mapped_column(Text, nullable=False)
    lida: Mapped[bool] = mapped_column(Boolean, server_default=false(), nullable=False)
    lida_em: Mapped[datetime | None] = mapped_column(DateTime)
    # Referência polimórfica (sem FK): notificação é informativa e pode sobreviver ao objeto.
    referencia_tipo: Mapped[ReferenciaNotificacao | None] = mapped_column(pg_enum(ReferenciaNotificacao, "referencia_notificacao"))
    referencia_id: Mapped[int | None] = mapped_column(BigInteger)
    # Alertas automáticos (ex.: "acao_vencendo:12:2026-09-27:8") não se repetem.
    chave_deduplicacao: Mapped[str | None] = mapped_column(String(191), unique=True)
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)


class ResumoSemanalPlano(Base):
    """Um resumo semanal gerado para um plano (período fechado, em datas locais).

    Guarda o progresso do plano no fechamento: é a única base confiável para a evolução da semana seguinte
    (o resumo só mostra "de X% para Y%" quando existe o registro do período imediatamente anterior). A chave
    única (plano, fim do período) impede gerar duas vezes o mesmo resumo (reexecução ou vários processos).
    """

    __tablename__ = "resumos_semanais_plano"
    __table_args__ = (UniqueConstraint("plano_id", "periodo_fim"),)

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    plano_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("planos_de_acao.id", ondelete="CASCADE"), nullable=False)
    # Quem recebeu (responsável/gestor do plano no momento do resumo).
    usuario_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("usuarios.id", ondelete="SET NULL"))
    periodo_inicio: Mapped[date] = mapped_column(Date, nullable=False)
    periodo_fim: Mapped[date] = mapped_column(Date, nullable=False)
    progresso: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    gerado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False, index=True)
