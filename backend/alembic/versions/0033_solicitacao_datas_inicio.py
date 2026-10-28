"""solicitação de alteração de datas: também a data de início (prazo inicial estimado)

- acao_solicitacao_alteracao.prazo_inicio_anterior: prazo inicial estimado vigente no momento do pedido.
- acao_solicitacao_alteracao.novo_prazo_inicio_sugerido: preenchida só quando o início foi pedido.
As solicitações antigas ficam com as duas vazias (pediam só a conclusão), sem mudança de significado.

Revision ID: 0033
Revises: 0032
Create Date: 2026-10-28 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0033'
down_revision: Union[str, None] = '0032'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('acao_solicitacao_alteracao', sa.Column('prazo_inicio_anterior', sa.Date(), nullable=True))
    op.add_column('acao_solicitacao_alteracao', sa.Column('novo_prazo_inicio_sugerido', sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column('acao_solicitacao_alteracao', 'novo_prazo_inicio_sugerido')
    op.drop_column('acao_solicitacao_alteracao', 'prazo_inicio_anterior')
