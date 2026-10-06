"""rótulo: "setores" passa a se chamar "funções/cargos" na descrição da permissão de cadastros

Só texto exibido na matriz de Perfis. Nenhuma tabela, coluna, ID ou vínculo muda (o cadastro continua
sendo a tabela `setores`), e nenhum nome cadastrado é alterado.

Revision ID: 0026
Revises: 0025
Create Date: 2026-10-06 10:00:00

"""
from typing import Sequence, Union

from alembic import op

revision: str = '0026'
down_revision: Union[str, None] = '0025'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE permissoes SET descricao = 'Gerenciar áreas, funções/cargos, tipos de plano e origens' "
        "WHERE codigo = 'cadastros:gerenciar'"
    )


def downgrade() -> None:
    op.execute(
        "UPDATE permissoes SET descricao = 'Gerenciar áreas, setores, tipos de plano e origens' "
        "WHERE codigo = 'cadastros:gerenciar'"
    )
