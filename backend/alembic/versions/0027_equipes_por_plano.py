"""equipes vinculadas a planos de ação, exclusão lógica e auditoria das equipes

- equipes.plano_id (nulo nas equipes já cadastradas: "Sem plano vinculado" até a regularização na edição;
  nenhum plano é atribuído automaticamente).
- equipes.criado_por_id, excluido_em/excluido_por_id (exclusão lógica: o registro, os participantes e o
  histórico ficam no banco).
- Sai a unicidade (área, nome): agora o nome não se repete dentro do mesmo plano (validado no serviço, sem
  diferenciar maiúsculas), e duas equipes de planos diferentes da mesma área podem ter o mesmo nome.
- equipe_historico: autor e data de criação, edição, participantes, coordenador, situação e exclusão.
- A coluna supervisor_id continua com o mesmo nome e os mesmos dados (na aplicação: "Coordenador da equipe").
Equipes, participantes, papéis e datas de entrada existentes não são alterados.

Revision ID: 0027
Revises: 0026
Create Date: 2026-10-06 14:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision: str = '0027'
down_revision: Union[str, None] = '0026'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BIGINT = sa.BigInteger().with_variant(mysql.BIGINT(unsigned=True), 'mysql')
DESCRICOES = {
    'equipes:ver': ('Visualizar equipes', 'Visualizar equipes (das quais participa ou que gerencia)'),
    'equipes:gerenciar': ('Criar, editar e excluir equipes e seus membros',
                          'Criar, editar e excluir equipes dos planos que gerencia'),
}


def _descricoes(indice: int) -> None:
    tabela = sa.table('permissoes', sa.column('codigo', sa.String), sa.column('descricao', sa.String))
    for codigo, textos in DESCRICOES.items():
        op.execute(tabela.update().where(tabela.c.codigo == codigo).values(descricao=textos[indice]))


def upgrade() -> None:
    op.add_column('equipes', sa.Column('plano_id', BIGINT, nullable=True))
    op.create_index(op.f('ix_equipes_plano_id'), 'equipes', ['plano_id'], unique=False)
    op.create_foreign_key(op.f('fk_equipes_plano_id_planos_de_acao'), 'equipes', 'planos_de_acao', ['plano_id'], ['id'],
                          ondelete='RESTRICT')
    op.add_column('equipes', sa.Column('criado_por_id', BIGINT, nullable=True))
    op.create_foreign_key(op.f('fk_equipes_criado_por_id_usuarios'), 'equipes', 'usuarios', ['criado_por_id'], ['id'])
    op.add_column('equipes', sa.Column('excluido_em', sa.DateTime(), nullable=True))
    op.add_column('equipes', sa.Column('excluido_por_id', BIGINT, nullable=True))
    op.create_index(op.f('ix_equipes_excluido_em'), 'equipes', ['excluido_em'], unique=False)
    op.create_foreign_key(op.f('fk_equipes_excluido_por_id_usuarios'), 'equipes', 'usuarios', ['excluido_por_id'], ['id'])
    # A FK de area_id continua coberta pelo índice ix_equipes_area_id (criado na 0011).
    op.drop_constraint('uq_equipes_area_nome', 'equipes', type_='unique')

    op.create_table('equipe_historico',
        sa.Column('id', BIGINT, autoincrement=True, nullable=False),
        sa.Column('equipe_id', BIGINT, nullable=False),
        sa.Column('autor_id', BIGINT, nullable=True),
        sa.Column('evento', sa.String(length=30), nullable=False),
        sa.Column('descricao', sa.Text(), nullable=False),
        sa.Column('criado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['equipe_id'], ['equipes.id'], name=op.f('fk_equipe_historico_equipe_id_equipes'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['autor_id'], ['usuarios.id'], name=op.f('fk_equipe_historico_autor_id_usuarios'), ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_equipe_historico')),
    )
    op.create_index(op.f('ix_equipe_historico_equipe_id'), 'equipe_historico', ['equipe_id'], unique=False)
    _descricoes(1)


def downgrade() -> None:
    _descricoes(0)
    op.drop_index(op.f('ix_equipe_historico_equipe_id'), table_name='equipe_historico')
    op.drop_table('equipe_historico')
    # Falha se houver nomes repetidos na mesma área (permitidos a partir desta versão): ajuste antes.
    op.create_unique_constraint('uq_equipes_area_nome', 'equipes', ['area_id', 'nome'])
    op.drop_constraint(op.f('fk_equipes_excluido_por_id_usuarios'), 'equipes', type_='foreignkey')
    op.drop_index(op.f('ix_equipes_excluido_em'), table_name='equipes')
    op.drop_column('equipes', 'excluido_por_id')
    op.drop_column('equipes', 'excluido_em')
    op.drop_constraint(op.f('fk_equipes_criado_por_id_usuarios'), 'equipes', type_='foreignkey')
    op.drop_column('equipes', 'criado_por_id')
    op.drop_constraint(op.f('fk_equipes_plano_id_planos_de_acao'), 'equipes', type_='foreignkey')
    op.drop_index(op.f('ix_equipes_plano_id'), table_name='equipes')
    op.drop_column('equipes', 'plano_id')
