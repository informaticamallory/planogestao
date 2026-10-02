"""device_tokens (push no app mobile)

Revision ID: 0010
Revises: 0009
Create Date: 2026-09-24 18:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision: str = '0010'
down_revision: Union[str, None] = '0009'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BIGINT = sa.BigInteger().with_variant(mysql.BIGINT(unsigned=True), 'mysql')


def upgrade() -> None:
    op.create_table('device_tokens',
    sa.Column('id', BIGINT, autoincrement=True, nullable=False),
    sa.Column('usuario_id', BIGINT, nullable=False),
    sa.Column('token', sa.String(length=255), nullable=False),
    sa.Column('plataforma', sa.String(length=10), nullable=False),
    sa.Column('ativo', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('criado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.Column('atualizado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], name=op.f('fk_device_tokens_usuario_id_usuarios'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_device_tokens')),
    sa.UniqueConstraint('token', name=op.f('uq_device_tokens_token'))
    )
    op.create_index(op.f('ix_device_tokens_usuario_id'), 'device_tokens', ['usuario_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_device_tokens_usuario_id'), table_name='device_tokens')
    op.drop_table('device_tokens')
