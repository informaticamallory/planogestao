from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String, Text, func, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, BigIntPK


class Equipe(Base):
    """Equipe de trabalho de um plano de ação. Um plano pode ter várias equipes e um usuário pode estar em
    várias. Equipes antigas podem estar sem plano (`plano_id` nulo): aparecem como "Sem plano vinculado"
    até a regularização na edição. Exclusão lógica (filtro global em exclusao_logica.py)."""

    __tablename__ = "equipes"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    nome: Mapped[str] = mapped_column(String(100), nullable=False)
    plano_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("planos_de_acao.id", ondelete="RESTRICT"), index=True)
    # Área do plano (copiada ao salvar). Nas equipes sem plano, é a área do cadastro antigo.
    area_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("areas.id", ondelete="RESTRICT"), nullable=False, index=True)
    # Cadastro antigo: a equipe não exige mais uma única função/cargo (o valor existente é preservado).
    setor_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("setores.id", ondelete="SET NULL"))
    # Coordenador da equipe (papel interno; não altera o perfil de acesso). Coluna antiga: supervisor_id.
    coordenador_id: Mapped[int] = mapped_column(
        "supervisor_id", BigIntPK, ForeignKey("usuarios.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    descricao: Mapped[str | None] = mapped_column(Text)
    ativo: Mapped[bool] = mapped_column(Boolean, server_default=true(), nullable=False)
    criado_por_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("usuarios.id"))
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    excluido_em: Mapped[datetime | None] = mapped_column(DateTime, index=True)
    excluido_por_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("usuarios.id"))

    plano = relationship("PlanoDeAcao", lazy="joined")
    area = relationship("Area", lazy="joined")
    setor = relationship("Setor", lazy="joined")
    coordenador = relationship("Usuario", lazy="joined", foreign_keys=[coordenador_id])
    criado_por = relationship("Usuario", foreign_keys=[criado_por_id])
    membros: Mapped[list["EquipeMembro"]] = relationship(back_populates="equipe", cascade="all, delete-orphan", passive_deletes=True)


class EquipeMembro(Base):
    __tablename__ = "equipe_membros"

    equipe_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("equipes.id", ondelete="CASCADE"), primary_key=True)
    usuario_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("usuarios.id", ondelete="CASCADE"), primary_key=True, index=True)
    papel_na_equipe: Mapped[str | None] = mapped_column(String(60))
    data_entrada: Mapped[date] = mapped_column(Date, nullable=False)

    equipe: Mapped[Equipe] = relationship(back_populates="membros")
    usuario = relationship("Usuario", lazy="joined")


class EquipeHistorico(Base):
    """Auditoria da equipe: criação, edição, participantes, coordenador, situação e exclusão."""

    __tablename__ = "equipe_historico"

    id: Mapped[int] = mapped_column(BigIntPK, primary_key=True, autoincrement=True)
    equipe_id: Mapped[int] = mapped_column(BigIntPK, ForeignKey("equipes.id", ondelete="CASCADE"), nullable=False, index=True)
    autor_id: Mapped[int | None] = mapped_column(BigIntPK, ForeignKey("usuarios.id", ondelete="SET NULL"))
    evento: Mapped[str] = mapped_column(String(30), nullable=False)
    descricao: Mapped[str] = mapped_column(Text, nullable=False)
    criado_em: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    autor = relationship("Usuario", lazy="joined")
