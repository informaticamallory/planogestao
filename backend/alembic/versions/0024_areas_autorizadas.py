"""áreas autorizadas por usuário (acesso a planos), separadas da lotação

- usuario_area_autorizada (N:N) + usuarios.todas_areas ("Todas as áreas", inclui as futuras).
- Usuários existentes começam com a própria lotação como área autorizada. Quem não tem lotação fica
  sem área (aparece como pendência para o Administrador). NINGUÉM recebe "Todas as áreas"
  automaticamente, nem quem tinha a antiga permissão "planos de todas as áreas".
- A permissão planos:ver_todos (mesmo código) passa a significar "Visualizar planos das áreas autorizadas".

Revision ID: 0024
Revises: 0023
Create Date: 2026-10-06 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision: str = '0024'
down_revision: Union[str, None] = '0023'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BIGINT = sa.BigInteger().with_variant(mysql.BIGINT(unsigned=True), 'mysql')


def upgrade() -> None:
    op.add_column('usuarios', sa.Column('todas_areas', sa.Boolean(), server_default=sa.false(), nullable=False))
    op.create_table('usuario_area_autorizada',
        sa.Column('usuario_id', BIGINT, nullable=False),
        sa.Column('area_id', BIGINT, nullable=False),
        sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], name=op.f('fk_usuario_area_autorizada_usuario_id_usuarios'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['area_id'], ['areas.id'], name=op.f('fk_usuario_area_autorizada_area_id_areas'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('usuario_id', 'area_id', name=op.f('pk_usuario_area_autorizada')),
    )
    op.create_index(op.f('ix_usuario_area_autorizada_area_id'), 'usuario_area_autorizada', ['area_id'], unique=False)
    op.execute("INSERT INTO usuario_area_autorizada (usuario_id, area_id) SELECT id, area_id FROM usuarios WHERE area_id IS NOT NULL")
    op.execute("UPDATE permissoes SET descricao = 'Visualizar planos das áreas autorizadas' WHERE codigo = 'planos:ver_todos'")


def downgrade() -> None:
    op.execute("UPDATE permissoes SET descricao = 'Visualizar planos de todas as áreas' WHERE codigo = 'planos:ver_todos'")
    op.drop_index(op.f('ix_usuario_area_autorizada_area_id'), table_name='usuario_area_autorizada')
    op.drop_table('usuario_area_autorizada')
    op.drop_column('usuarios', 'todas_areas')
