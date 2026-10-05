"""vínculos padrão Tipo de Plano ↔ Origem sobre os cadastros existentes

Os tipos e as origens de produção foram cadastrados depois da 0015 (que só semeou tipo_origem com o
que existia na época), então nenhuma origem tinha tipo e o formulário do plano ficava sem origens.
Só acrescenta vínculos, pelos IDs, localizando os cadastros pelo nome; não cria, une nem renomeia nada.
O relatório (inclusive pendências: nome não encontrado ou ambíguo) sai no log da implantação.

Revision ID: 0021
Revises: 0020
Create Date: 2026-10-05 10:00:00

"""
import logging
from typing import Sequence, Union

from alembic import op

from app.seed.vinculos_tipo_origem import aplicar

revision: str = '0021'
down_revision: Union[str, None] = '0020'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

log = logging.getLogger("alembic.runtime.migration")


def upgrade() -> None:
    for linha in aplicar(op.get_bind()).linhas():
        log.info(linha)


def downgrade() -> None:
    # Sem volta automática: depois da implantação os vínculos são editados em Tipos de Plano e não dá
    # para separar os desta migração dos ajustados à mão. Remover vínculos é pela tela.
    pass
