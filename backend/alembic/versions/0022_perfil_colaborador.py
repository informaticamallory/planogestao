"""perfil Supervisor passa a se chamar Colaborador

Renomeia o registro existente: mesmo ID, mesmos usuários e mesmas permissões (nada é recriado).
Nenhuma regra de acesso usa o nome desse perfil, só as permissões dele. Se já existir um perfil
"Colaborador" (criado à mão), não une os dois: deixa como está e avisa no log.
O "Supervisor" das equipes (supervisor_id) é outra coisa e não muda.

Revision ID: 0022
Revises: 0021
Create Date: 2026-10-05 14:00:00

"""
import logging
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0022'
down_revision: Union[str, None] = '0021'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

log = logging.getLogger("alembic.runtime.migration")


def _renomear(de: str, para: str) -> None:
    conn = op.get_bind()
    existe = lambda nome: conn.execute(sa.text("SELECT id FROM perfis WHERE nome = :n"), {"n": nome}).scalar()
    origem, destino = existe(de), existe(para)
    if origem is None:
        log.info("Perfil “%s” não existe: nada a renomear.", de)
    elif destino is not None:
        log.warning("Perfis “%s” (#%s) e “%s” (#%s) já existem: nada foi alterado nem unido.", de, origem, para, destino)
    else:
        conn.execute(sa.text("UPDATE perfis SET nome = :para WHERE id = :id"), {"para": para, "id": origem})
        log.info("Perfil #%s renomeado de “%s” para “%s”.", origem, de, para)


def upgrade() -> None:
    _renomear("Supervisor", "Colaborador")


def downgrade() -> None:
    _renomear("Colaborador", "Supervisor")
