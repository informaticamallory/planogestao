"""gamificação: "Quantidade de colocações no pódio" em Configurações (sem mínimo de colaboradores)

- configuracoes: a chave "gamificacao_minimo_podio" passa a ser "gamificacao_colocacoes_podio", COM O MESMO VALOR
  (o número que o Administrador já salvou vira a quantidade de colocações: 3 = Top 3). A regra de mínimo deixa de
  existir.
- gamificacao_periodos.tamanho_podio (criada na 0031) sai: o Top é um só, o de Configurações.

Revision ID: 0032
Revises: 0031
Create Date: 2026-10-13 18:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0032'
down_revision: Union[str, None] = '0031'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE configuracoes SET chave = 'gamificacao_colocacoes_podio' WHERE chave = 'gamificacao_minimo_podio'")
    op.drop_column('gamificacao_periodos', 'tamanho_podio')


def downgrade() -> None:
    op.add_column('gamificacao_periodos', sa.Column('tamanho_podio', sa.SmallInteger(), server_default='5', nullable=False))
    op.execute("UPDATE configuracoes SET chave = 'gamificacao_minimo_podio' WHERE chave = 'gamificacao_colocacoes_podio'")
