"""cadastros (áreas, setores, tipos de plano, origens) liberados por permissão: Administrador e Gestor

Troca as quatro permissões exclusivas do Administrador (admin:areas, admin:setores, admin:tipos_plano,
admin:origens) por uma permissão comum, atribuível na tela de Perfis: cadastros:gerenciar.

Revision ID: 0020
Revises: 0019
Create Date: 2026-10-03 15:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0020'
down_revision: Union[str, None] = '0019'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

ANTIGAS = {
    "admin:areas": "Gerenciar áreas",
    "admin:setores": "Gerenciar setores",
    "admin:tipos_plano": "Gerenciar tipos de plano",
    "admin:origens": "Gerenciar origens e a compatibilidade com os tipos",
}
LISTA = ", ".join(f"'{c}'" for c in ANTIGAS)


def upgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "INSERT INTO permissoes (codigo, modulo, acao, descricao) "
        "SELECT 'cadastros:gerenciar', 'cadastros', 'editar', 'Gerenciar áreas, setores, tipos de plano e origens' "
        "WHERE NOT EXISTS (SELECT 1 FROM permissoes WHERE codigo = 'cadastros:gerenciar')"
    ))
    # Administrador (sempre todas) e Gestor; outros perfis podem receber pela tela de Perfis.
    conn.execute(sa.text(
        "INSERT IGNORE INTO perfil_permissao (perfil_id, permissao_id) "
        "SELECT pf.id, pm.id FROM perfis pf JOIN permissoes pm ON pm.codigo = 'cadastros:gerenciar' "
        "WHERE pf.nome IN ('Administrador', 'Gestor')"
    ))
    conn.execute(sa.text(
        f"DELETE pp FROM perfil_permissao pp JOIN permissoes pm ON pm.id = pp.permissao_id WHERE pm.codigo IN ({LISTA})"
    ))
    conn.execute(sa.text(f"DELETE FROM permissoes WHERE codigo IN ({LISTA})"))


def downgrade() -> None:
    conn = op.get_bind()
    for codigo, descricao in ANTIGAS.items():
        conn.execute(
            sa.text(
                "INSERT INTO permissoes (codigo, modulo, acao, descricao) SELECT :c, 'administracao', 'outra', :d "
                "WHERE NOT EXISTS (SELECT 1 FROM permissoes WHERE codigo = :c)"
            ),
            {"c": codigo, "d": descricao},
        )
    conn.execute(sa.text(
        f"INSERT IGNORE INTO perfil_permissao (perfil_id, permissao_id) "
        f"SELECT pf.id, pm.id FROM perfis pf JOIN permissoes pm ON pm.codigo IN ({LISTA}) WHERE pf.nome = 'Administrador'"
    ))
    conn.execute(sa.text(
        "DELETE pp FROM perfil_permissao pp JOIN permissoes pm ON pm.id = pp.permissao_id WHERE pm.codigo = 'cadastros:gerenciar'"
    ))
    conn.execute(sa.text("DELETE FROM permissoes WHERE codigo = 'cadastros:gerenciar'"))
