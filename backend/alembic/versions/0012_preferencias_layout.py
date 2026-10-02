"""preferencias_layout (personalização de widgets por usuário)

Revision ID: 0012
Revises: 0011
Create Date: 2026-09-25 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision: str = '0012'
down_revision: Union[str, None] = '0011'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BIGINT = sa.BigInteger().with_variant(mysql.BIGINT(unsigned=True), 'mysql')


def upgrade() -> None:
    op.create_table('preferencias_layout',
    sa.Column('usuario_id', BIGINT, nullable=False),
    sa.Column('tela', sa.String(length=30), nullable=False),
    sa.Column('config', sa.JSON(), nullable=False),
    sa.Column('atualizado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], name=op.f('fk_preferencias_layout_usuario_id_usuarios'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('usuario_id', 'tela', name=op.f('pk_preferencias_layout'))
    )


def downgrade() -> None:
    op.drop_table('preferencias_layout')
