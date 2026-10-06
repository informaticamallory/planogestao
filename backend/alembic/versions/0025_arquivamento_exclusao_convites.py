"""arquivamento/exclusão de ações, exclusão lógica de planos e convites de colaboradores

- acoes: arquivado_em/arquivado_por_id (arquivamento individual) e excluido_em/excluido_por_id.
- planos_de_acao: excluido_em/excluido_por_id (exclusão lógica: o registro e o histórico ficam).
- usuarios.convite_pendente + usuario_convites (só o hash do token) + usuario_convite_eventos (auditoria).
- Permissões novas: planos:excluir, acoes:arquivar, acoes:excluir e colaboradores:convidar, para
  Administrador e Gestor (os demais perfis recebem pela tela Perfis).
Nada existente é alterado: ações e planos atuais continuam como estão.

Revision ID: 0025
Revises: 0024
Create Date: 2026-10-07 09:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision: str = '0025'
down_revision: Union[str, None] = '0024'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BIGINT = sa.BigInteger().with_variant(mysql.BIGINT(unsigned=True), 'mysql')
EVENTO = sa.Enum('cadastro', 'envio', 'reenvio', 'cancelamento', 'ativacao', name='evento_convite')
PERMISSOES = [
    ('planos:excluir', 'planos', 'excluir', 'Excluir planos (com suas ações e sub-itens)'),
    ('acoes:arquivar', 'acoes', 'outra', 'Arquivar e desarquivar ações e sub-itens'),
    ('acoes:excluir', 'acoes', 'excluir', 'Excluir ações e sub-itens'),
    ('colaboradores:convidar', 'colaboradores', 'criar', 'Convidar colaboradores (perfil Colaborador, nas próprias áreas)'),
]


def _colunas(tabela: str, prefixo: str) -> None:
    op.add_column(tabela, sa.Column(f'{prefixo}_em', sa.DateTime(), nullable=True))
    op.add_column(tabela, sa.Column(f'{prefixo}_por_id', BIGINT, nullable=True))
    op.create_index(op.f(f'ix_{tabela}_{prefixo}_em'), tabela, [f'{prefixo}_em'], unique=False)
    op.create_foreign_key(op.f(f'fk_{tabela}_{prefixo}_por_id_usuarios'), tabela, 'usuarios', [f'{prefixo}_por_id'], ['id'])


def _remover_colunas(tabela: str, prefixo: str) -> None:
    op.drop_constraint(op.f(f'fk_{tabela}_{prefixo}_por_id_usuarios'), tabela, type_='foreignkey')
    op.drop_index(op.f(f'ix_{tabela}_{prefixo}_em'), table_name=tabela)
    op.drop_column(tabela, f'{prefixo}_por_id')
    op.drop_column(tabela, f'{prefixo}_em')


def upgrade() -> None:
    _colunas('acoes', 'arquivado')
    _colunas('acoes', 'excluido')
    _colunas('planos_de_acao', 'excluido')
    op.add_column('usuarios', sa.Column('convite_pendente', sa.Boolean(), server_default=sa.false(), nullable=False))

    op.create_table('usuario_convites',
        sa.Column('id', BIGINT, autoincrement=True, nullable=False),
        sa.Column('usuario_id', BIGINT, nullable=False),
        sa.Column('criado_por_id', BIGINT, nullable=False),
        sa.Column('token_hash', sa.String(length=64), nullable=False),
        sa.Column('expira_em', sa.DateTime(), nullable=False),
        sa.Column('criado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('usado_em', sa.DateTime(), nullable=True),
        sa.Column('cancelado_em', sa.DateTime(), nullable=True),
        sa.Column('substituido_em', sa.DateTime(), nullable=True),
        sa.Column('envio_id', BIGINT, nullable=True),
        sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], name=op.f('fk_usuario_convites_usuario_id_usuarios'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['criado_por_id'], ['usuarios.id'], name=op.f('fk_usuario_convites_criado_por_id_usuarios')),
        sa.ForeignKeyConstraint(['envio_id'], ['envios_email.id'], name=op.f('fk_usuario_convites_envio_id_envios_email'), ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_usuario_convites')),
        sa.UniqueConstraint('token_hash', name=op.f('uq_usuario_convites_token_hash')),
    )
    op.create_index(op.f('ix_usuario_convites_usuario_id'), 'usuario_convites', ['usuario_id'], unique=False)
    op.create_index(op.f('ix_usuario_convites_criado_por_id'), 'usuario_convites', ['criado_por_id'], unique=False)
    op.create_table('usuario_convite_eventos',
        sa.Column('id', BIGINT, autoincrement=True, nullable=False),
        sa.Column('convite_id', BIGINT, nullable=False),
        sa.Column('usuario_id', BIGINT, nullable=False),
        sa.Column('evento', EVENTO, nullable=False),
        sa.Column('autor_id', BIGINT, nullable=True),
        sa.Column('detalhe', sa.String(length=500), nullable=True),
        sa.Column('criado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['convite_id'], ['usuario_convites.id'], name=op.f('fk_usuario_convite_eventos_convite_id_usuario_convites'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], name=op.f('fk_usuario_convite_eventos_usuario_id_usuarios'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['autor_id'], ['usuarios.id'], name=op.f('fk_usuario_convite_eventos_autor_id_usuarios')),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_usuario_convite_eventos')),
    )
    op.create_index(op.f('ix_usuario_convite_eventos_convite_id'), 'usuario_convite_eventos', ['convite_id'], unique=False)
    op.create_index(op.f('ix_usuario_convite_eventos_usuario_id'), 'usuario_convite_eventos', ['usuario_id'], unique=False)

    for codigo, modulo, acao, descricao in PERMISSOES:
        op.execute(
            "INSERT INTO permissoes (codigo, modulo, acao, descricao) "
            f"SELECT '{codigo}', '{modulo}', '{acao}', '{descricao}' "
            f"WHERE NOT EXISTS (SELECT 1 FROM permissoes WHERE codigo = '{codigo}')"
        )
        op.execute(
            "INSERT INTO perfil_permissao (perfil_id, permissao_id) "
            f"SELECT pf.id, pm.id FROM perfis pf JOIN permissoes pm ON pm.codigo = '{codigo}' "
            "WHERE pf.nome IN ('Administrador', 'Gestor') "
            "AND NOT EXISTS (SELECT 1 FROM perfil_permissao x WHERE x.perfil_id = pf.id AND x.permissao_id = pm.id)"
        )


def downgrade() -> None:
    lista = ", ".join(f"'{c}'" for c, _, _, _ in PERMISSOES)
    op.execute(f"DELETE FROM perfil_permissao WHERE permissao_id IN (SELECT id FROM permissoes WHERE codigo IN ({lista}))")
    op.execute(f"DELETE FROM permissoes WHERE codigo IN ({lista})")
    op.drop_table('usuario_convite_eventos')
    op.drop_table('usuario_convites')
    op.drop_column('usuarios', 'convite_pendente')
    _remover_colunas('planos_de_acao', 'excluido')
    _remover_colunas('acoes', 'excluido')
    _remover_colunas('acoes', 'arquivado')
