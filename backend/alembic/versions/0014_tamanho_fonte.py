"""usuarios.tamanho_fonte (tela Meu Perfil)

Revision ID: 0014
Revises: 0013
Create Date: 2026-09-28 09:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0014'
down_revision: Union[str, None] = '0013'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('usuarios', sa.Column('tamanho_fonte', sa.String(length=16), server_default='padrao', nullable=False))


def downgrade() -> None:
    op.drop_column('usuarios', 'tamanho_fonte')
