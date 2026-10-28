"""contraproposta do gestor na solicitação de alteração de datas

- acao_contraproposta: outras datas sugeridas pelo gestor (uma pendente por solicitação), com a resposta do
  solicitante. As anteriores ficam como histórico da negociação.
- status_solicitacao ganha "acordo" (o solicitante aceitou a contraproposta).
- evento_historico ganha "contraproposta" e "resposta_contraproposta" (linha do tempo do item).

Revision ID: 0034
Revises: 0033
Create Date: 2026-10-28 15:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision: str = '0034'
down_revision: Union[str, None] = '0033'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BIGINT = sa.BigInteger().with_variant(mysql.BIGINT(unsigned=True), 'mysql')
EVENTOS = ('criacao', 'alteracao', 'comentario', 'solicitacao', 'resposta_solicitacao')
STATUS = ('pendente', 'aceita', 'recusada')


def upgrade() -> None:
    op.create_table(
        'acao_contraproposta',
        sa.Column('id', BIGINT, autoincrement=True, nullable=False),
        sa.Column('solicitacao_id', BIGINT, nullable=False),
        sa.Column('prazo_inicio_vigente', sa.Date(), nullable=True),
        sa.Column('prazo_vigente', sa.Date(), nullable=False),
        sa.Column('novo_prazo_inicio', sa.Date(), nullable=True),
        sa.Column('novo_prazo', sa.Date(), nullable=False),
        sa.Column('justificativa', sa.Text(), nullable=False),
        sa.Column('status', sa.Enum('pendente', 'aceita', 'nao_aceita', 'substituida', 'encerrada', name='status_contraproposta'),
                  nullable=False),
        sa.Column('proposto_por_id', BIGINT, nullable=False),
        sa.Column('resposta_justificativa', sa.Text(), nullable=True),
        sa.Column('respondido_em', sa.DateTime(), nullable=True),
        sa.Column('criado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['solicitacao_id'], ['acao_solicitacao_alteracao.id'], ondelete='CASCADE',
                                name=op.f('fk_acao_contraproposta_solicitacao_id_acao_solicitacao_alteracao')),
        sa.ForeignKeyConstraint(['proposto_por_id'], ['usuarios.id'], name=op.f('fk_acao_contraproposta_proposto_por_id_usuarios')),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_acao_contraproposta')),
    )
    op.create_index('ix_acao_contraproposta_solicitacao', 'acao_contraproposta', ['solicitacao_id', 'status'], unique=False)
    op.alter_column('acao_solicitacao_alteracao', 'status', existing_type=sa.Enum(*STATUS, name='status_solicitacao'),
                    type_=sa.Enum(*STATUS, 'acordo', name='status_solicitacao'), existing_nullable=False)
    op.alter_column('acao_historico', 'evento', existing_type=sa.Enum(*EVENTOS, name='evento_historico'),
                    type_=sa.Enum(*EVENTOS, 'contraproposta', 'resposta_contraproposta', name='evento_historico'),
                    existing_nullable=False)


def downgrade() -> None:
    op.execute("DELETE FROM acao_historico WHERE evento IN ('contraproposta', 'resposta_contraproposta')")
    op.execute("UPDATE acao_solicitacao_alteracao SET status = 'aceita' WHERE status = 'acordo'")
    op.alter_column('acao_historico', 'evento', existing_type=sa.Enum(*EVENTOS, 'contraproposta', 'resposta_contraproposta',
                                                                        name='evento_historico'),
                    type_=sa.Enum(*EVENTOS, name='evento_historico'), existing_nullable=False)
    op.alter_column('acao_solicitacao_alteracao', 'status', existing_type=sa.Enum(*STATUS, 'acordo', name='status_solicitacao'),
                    type_=sa.Enum(*STATUS, name='status_solicitacao'), existing_nullable=False)
    op.drop_index('ix_acao_contraproposta_solicitacao', table_name='acao_contraproposta')
    op.drop_table('acao_contraproposta')
