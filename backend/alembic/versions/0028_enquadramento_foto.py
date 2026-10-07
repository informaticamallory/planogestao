"""enquadramento da foto de perfil: usuarios.avatar_ajuste

Formato (circular/quadrado), encaixe (preencher/inteira), posição e zoom da foto, por usuário (ver
app/core/foto.py). Nulo = padrão (quadrado arredondado, centralizado): as fotos já enviadas continuam iguais.
A coluna avatar_url não muda (continua guardando o endereço do arquivo).

Revision ID: 0028
Revises: 0027
Create Date: 2026-10-07 15:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0028'
down_revision: Union[str, None] = '0027'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('usuarios', sa.Column('avatar_ajuste', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('usuarios', 'avatar_ajuste')
