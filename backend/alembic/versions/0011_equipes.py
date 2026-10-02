"""equipes e membros

Revision ID: 0011
Revises: 0010
Create Date: 2026-09-24 19:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision: str = '0011'
down_revision: Union[str, None] = '0010'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BIGINT = sa.BigInteger().with_variant(mysql.BIGINT(unsigned=True), 'mysql')


def upgrade() -> None:
    op.create_table('equipes',
    sa.Column('id', BIGINT, autoincrement=True, nullable=False),
    sa.Column('nome', sa.String(length=100), nullable=False),
    sa.Column('area_id', BIGINT, nullable=False),
    sa.Column('setor_id', BIGINT, nullable=True),
    sa.Column('supervisor_id', BIGINT, nullable=False),
    sa.Column('descricao', sa.Text(), nullable=True),
    sa.Column('ativo', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('criado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.Column('atualizado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['area_id'], ['areas.id'], name=op.f('fk_equipes_area_id_areas'), ondelete='RESTRICT'),
    sa.ForeignKeyConstraint(['setor_id'], ['setores.id'], name=op.f('fk_equipes_setor_id_setores'), ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['supervisor_id'], ['usuarios.id'], name=op.f('fk_equipes_supervisor_id_usuarios'), ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_equipes')),
    sa.UniqueConstraint('area_id', 'nome', name='uq_equipes_area_nome')
    )
    op.create_index(op.f('ix_equipes_area_id'), 'equipes', ['area_id'], unique=False)
    op.create_index(op.f('ix_equipes_supervisor_id'), 'equipes', ['supervisor_id'], unique=False)

    op.create_table('equipe_membros',
    sa.Column('equipe_id', BIGINT, nullable=False),
    sa.Column('usuario_id', BIGINT, nullable=False),
    sa.Column('papel_na_equipe', sa.String(length=60), nullable=True),
    sa.Column('data_entrada', sa.Date(), nullable=False),
    sa.ForeignKeyConstraint(['equipe_id'], ['equipes.id'], name=op.f('fk_equipe_membros_equipe_id_equipes'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], name=op.f('fk_equipe_membros_usuario_id_usuarios'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('equipe_id', 'usuario_id', name=op.f('pk_equipe_membros'))
    )
    op.create_index(op.f('ix_equipe_membros_usuario_id'), 'equipe_membros', ['usuario_id'], unique=False)

    # Nova permissão do catálogo (app/core/permissoes.py): Administrador (sempre todas) e Gestor.
    conn = op.get_bind()
    conn.execute(sa.text(
        "INSERT INTO permissoes (codigo, modulo, acao, descricao) "
        "SELECT 'equipes:gerenciar', 'equipes', 'editar', 'Criar, editar e excluir equipes e seus membros' "
        "WHERE NOT EXISTS (SELECT 1 FROM permissoes WHERE codigo = 'equipes:gerenciar')"
    ))
    conn.execute(sa.text(
        "INSERT IGNORE INTO perfil_permissao (perfil_id, permissao_id) "
        "SELECT pf.id, pm.id FROM perfis pf JOIN permissoes pm ON pm.codigo = 'equipes:gerenciar' "
        "WHERE pf.nome IN ('Administrador', 'Gestor')"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "DELETE pp FROM perfil_permissao pp JOIN permissoes pm ON pm.id = pp.permissao_id WHERE pm.codigo = 'equipes:gerenciar'"
    ))
    conn.execute(sa.text("DELETE FROM permissoes WHERE codigo = 'equipes:gerenciar'"))
    op.drop_index(op.f('ix_equipe_membros_usuario_id'), table_name='equipe_membros')
    op.drop_table('equipe_membros')
    op.drop_index(op.f('ix_equipes_supervisor_id'), table_name='equipes')
    op.drop_index(op.f('ix_equipes_area_id'), table_name='equipes')
    op.drop_table('equipes')
