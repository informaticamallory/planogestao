"""modelos de e-mail editáveis, CCO e histórico (Configurações de e-mail)

Revision ID: 0019
Revises: 0018
Create Date: 2026-10-02 09:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision: str = '0019'
down_revision: Union[str, None] = '0018'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BIGINT = sa.BigInteger().with_variant(mysql.BIGINT(unsigned=True), 'mysql')


def upgrade() -> None:
    # Sem linhas iniciais: modelo ausente = texto padrão (services/email_modelos.py), ativo.
    op.create_table('modelos_email',
    sa.Column('evento', sa.String(length=40), nullable=False),
    sa.Column('assunto', sa.String(length=255), nullable=False),
    sa.Column('corpo', sa.Text(), nullable=False),
    sa.Column('cco', sa.JSON(), nullable=False),
    sa.Column('ativo', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('atualizado_por_id', BIGINT, nullable=True),
    sa.Column('atualizado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['atualizado_por_id'], ['usuarios.id'], name=op.f('fk_modelos_email_atualizado_por_id_usuarios'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('evento', name=op.f('pk_modelos_email'))
    )
    op.create_table('config_email',
    sa.Column('chave', sa.String(length=40), nullable=False),
    sa.Column('valor', sa.JSON(), nullable=False),
    sa.Column('atualizado_por_id', BIGINT, nullable=True),
    sa.Column('atualizado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['atualizado_por_id'], ['usuarios.id'], name=op.f('fk_config_email_atualizado_por_id_usuarios'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('chave', name=op.f('pk_config_email'))
    )
    op.create_table('historico_config_email',
    sa.Column('id', BIGINT, autoincrement=True, nullable=False),
    sa.Column('escopo', sa.String(length=40), nullable=False),
    sa.Column('campo', sa.String(length=40), nullable=False),
    sa.Column('valor_anterior', sa.Text(), nullable=True),
    sa.Column('valor_novo', sa.Text(), nullable=True),
    sa.Column('usuario_id', BIGINT, nullable=True),
    sa.Column('criado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], name=op.f('fk_historico_config_email_usuario_id_usuarios'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_historico_config_email'))
    )
    op.create_index(op.f('ix_historico_config_email_usuario_id'), 'historico_config_email', ['usuario_id'], unique=False)
    op.add_column('envios_email', sa.Column('cco', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('envios_email', 'cco')
    # Remover as tabelas já leva os índices (o MySQL não apaga antes o índice usado pela FK).
    op.drop_table('historico_config_email')
    op.drop_table('config_email')
    op.drop_table('modelos_email')
