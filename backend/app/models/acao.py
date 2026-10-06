from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Table,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, BigIntPK, TimestampMixin
from app.models.enums import EventoHistorico, Prioridade, StatusAcao, StatusSolicitacao, pg_enum
from app.models.estrutura import Area, Setor
from app.models.plano import PlanoDeAcao
from app.models.usuario import Usuario

# "Depende da conclusão de": acao_id só pode iniciar quando todas as depende_de_id estiverem concluídas.
# RESTRICT no pré-requisito: uma ação usada como pré-requisito não pode ser apagada com vínculos.
acao_dependencia = Table(
    "acao_dependencia",
    Base.metadata,
    Column("acao_id", BigIntPK, ForeignKey("acoes.id", ondelete="CASCADE"), primary_key=True),
    Column("depende_de_id", BigIntPK, ForeignKey("acoes.id", ondelete="RESTRICT"), primary_key=True, index=True),
)


class Acao(TimestampMixin, Base):
    __tablename__ = "acoes"
    __table_args__ = (
        CheckConstraint("progresso BETWEEN 0 AND 100", name="progresso_0_100"),
        Index("ix_acoes_responsavel_status", "responsavel_id", "status"),
        Index("ix_acoes_criado_em", "criado_em"),
    )

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    plano_id: Mapped[int] = mapped_column(
        BigIntPK, ForeignKey("planos_de_acao.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Subação: aponta para a ação principal (um nível só). NULL = ação principal.
    acao_pai_id: Mapped[int | None] = mapped_column(
        BigIntPK, ForeignKey("acoes.id", ondelete="CASCADE"), index=True
    )
    # Numeração persistente: ações principais 1, 2, 3… no plano; subações 1, 2… dentro da principal (→ "1.2").
    numero: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    descricao: Mapped[str] = mapped_column(Text, nullable=False)
    responsavel_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("usuarios.id"), nullable=False)
    area_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("areas.id"), nullable=False, index=True)
    setor_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("setores.id"))
    # Previsão de início (estimada). NULL só em ações cadastradas antes do campo existir.
    prazo_inicio: Mapped[date | None] = mapped_column(Date)
    # Prazo de conclusão (estimado).
    prazo: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    criado_por_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("usuarios.id"))
    prioridade: Mapped[Prioridade] = mapped_column(pg_enum(Prioridade, "prioridade"), nullable=False)
    status: Mapped[StatusAcao] = mapped_column(
        pg_enum(StatusAcao, "status_acao"), nullable=False, default=StatusAcao.AGUARDANDO_ACEITE
    )
    progresso: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=0)
    observacao: Mapped[str | None] = mapped_column(Text)
    motivo_recusa: Mapped[str | None] = mapped_column(String(500))
    motivo_bloqueio: Mapped[str | None] = mapped_column(String(500))
    motivo_cancelamento: Mapped[str | None] = mapped_column(String(500))
    aceita_em: Mapped[datetime | None] = mapped_column(DateTime)
    # Datas reais (as estimadas são prazo_inicio/prazo): 1ª vez em andamento e conclusão.
    iniciada_em: Mapped[datetime | None] = mapped_column(DateTime)
    concluida_em: Mapped[datetime | None] = mapped_column(DateTime)
    # Arquivada individualmente: fora das listas operacionais e do cálculo do plano, somente leitura.
    # Sub-itens arquivados junto recebem o MESMO instante (o desarquivamento devolve exatamente esses).
    arquivado_em: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    arquivado_por_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("usuarios.id"))
    # Exclusão lógica: some de todas as consultas (filtro global em core/exclusao_logica.py); o registro fica.
    excluido_em: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    excluido_por_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("usuarios.id"))

    plano: Mapped[PlanoDeAcao] = relationship(back_populates="acoes")
    responsavel: Mapped[Usuario] = relationship(foreign_keys=[responsavel_id])
    criado_por: Mapped[Usuario | None] = relationship(foreign_keys=[criado_por_id])
    area: Mapped[Area] = relationship()
    setor: Mapped[Setor | None] = relationship()
    acao_pai: Mapped["Acao | None"] = relationship(remote_side=[id], back_populates="subacoes")
    subacoes: Mapped[list["Acao"]] = relationship(back_populates="acao_pai", order_by="Acao.numero")
    depende_de: Mapped[list["Acao"]] = relationship(
        secondary=acao_dependencia,
        primaryjoin=lambda: Acao.id == acao_dependencia.c.acao_id,
        secondaryjoin=lambda: Acao.id == acao_dependencia.c.depende_de_id,
        order_by=lambda: Acao.numero,
        back_populates="dependentes",
    )
    dependentes: Mapped[list["Acao"]] = relationship(
        secondary=acao_dependencia,
        primaryjoin=lambda: Acao.id == acao_dependencia.c.depende_de_id,
        secondaryjoin=lambda: Acao.id == acao_dependencia.c.acao_id,
        order_by=lambda: Acao.numero,
        back_populates="depende_de",
    )

    @property
    def eh_subacao(self) -> bool:
        # acao_pai cobre a subação ainda não gravada (sem acao_pai_id).
        return self.acao_pai_id is not None or self.acao_pai is not None

    # ---- hierarquia (qualquer profundidade; o vínculo é sempre pelo id do pai imediato) ----------

    @property
    def ancestrais(self) -> list["Acao"]:
        """Do pai imediato até a ação principal."""
        cadeia: list[Acao] = []
        atual = self.acao_pai
        while atual is not None:
            cadeia.append(atual)
            atual = atual.acao_pai
        return cadeia

    @property
    def caminho(self) -> list["Acao"]:
        """Da ação principal até o pai imediato (ordem de leitura: PA → Ação 1 → Subação 1.1 → …)."""
        return list(reversed(self.ancestrais))

    @property
    def principal(self) -> "Acao":
        return self.caminho[0] if self.acao_pai is not None else self

    @property
    def nivel(self) -> int:
        """0 = ação principal; 1 = subação direta; 2 = subação da subação…"""
        return len(self.ancestrais)

    def descendentes(self) -> list["Acao"]:
        """Todas as subações abaixo (filhos, netos…), em profundidade e na ordem da numeração."""
        todos: list[Acao] = []
        for filho in self.subacoes:
            todos.append(filho)
            todos.extend(filho.descendentes())
        return todos

    @property
    def numero_exibicao(self) -> str:
        """"3" para a ação principal; "3.2", "3.2.1"… para as subações (só visual: vínculos usam o id)."""
        return f"{self.acao_pai.numero_exibicao}.{self.numero}" if self.acao_pai is not None else str(self.numero)
    historico: Mapped[list["AcaoHistorico"]] = relationship(
        back_populates="acao", order_by="AcaoHistorico.criado_em"
    )
    solicitacoes: Mapped[list["AcaoSolicitacaoAlteracao"]] = relationship(
        back_populates="acao", order_by="AcaoSolicitacaoAlteracao.criado_em"
    )


class AcaoHistorico(Base):
    __tablename__ = "acao_historico"
    __table_args__ = (Index("ix_acao_historico_acao_criado", "acao_id", "criado_em"),)

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    acao_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("acoes.id", ondelete="CASCADE"), nullable=False)
    usuario_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("usuarios.id"), nullable=False, index=True)
    evento: Mapped[EventoHistorico] = mapped_column(pg_enum(EventoHistorico, "evento_historico"), nullable=False)
    campo_alterado: Mapped[str | None] = mapped_column(String(50))
    valor_anterior: Mapped[str | None] = mapped_column(Text)
    valor_novo: Mapped[str | None] = mapped_column(Text)
    # Texto livre do evento: motivo de uma solicitação, justificativa de uma resposta etc.
    detalhe: Mapped[str | None] = mapped_column(Text)
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False, index=True)

    acao: Mapped[Acao] = relationship(back_populates="historico")
    usuario: Mapped[Usuario] = relationship()


class AcaoSolicitacaoAlteracao(Base):
    """Contraproposta de prazo feita pelo responsável e respondida pelo gestor do plano."""

    __tablename__ = "acao_solicitacao_alteracao"
    __table_args__ = (Index("ix_acao_solicitacao_acao_status", "acao_id", "status"),)

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    acao_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("acoes.id", ondelete="CASCADE"), nullable=False)
    prazo_anterior: Mapped[date] = mapped_column(Date, nullable=False)
    novo_prazo_sugerido: Mapped[date] = mapped_column(Date, nullable=False)
    motivo: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[StatusSolicitacao] = mapped_column(
        pg_enum(StatusSolicitacao, "status_solicitacao"), nullable=False, default=StatusSolicitacao.PENDENTE
    )
    # A ação estava aguardando aceite quando o pedido foi feito (aprovar = aceitar a ação).
    feita_antes_do_aceite: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    solicitado_por_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("usuarios.id"), nullable=False)
    respondido_por_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("usuarios.id"))
    resposta_justificativa: Mapped[str | None] = mapped_column(Text)
    respondido_em: Mapped[datetime | None] = mapped_column(DateTime)
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    acao: Mapped[Acao] = relationship(back_populates="solicitacoes")
    solicitado_por: Mapped[Usuario] = relationship(foreign_keys=[solicitado_por_id])
    respondido_por: Mapped[Usuario | None] = relationship(foreign_keys=[respondido_por_id])
