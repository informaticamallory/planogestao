"""usuarios.tema e usuarios.cor_destaque (tela Meu Perfil)

Revision ID: 0013
Revises: 0012
Create Date: 2026-09-25 14:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0013'
down_revision: Union[str, None] = '0012'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('usuarios', sa.Column('tema', sa.String(length=12), server_default='automatico', nullable=False))
    op.add_column('usuarios', sa.Column('cor_destaque', sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column('usuarios', 'cor_destaque')
    op.drop_column('usuarios', 'tema')
