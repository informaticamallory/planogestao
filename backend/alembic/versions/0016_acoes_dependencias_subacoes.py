"""Ações: área/setor próprios, prazo inicial estimado, numeração, dependências e subações

- acoes ganha:
  - area_id/setor_id: preenchidos com a área/setor do plano (nenhuma ação fica sem área);
  - prazo_inicio: previsão de início (NULL nas ações antigas, que não tinham o campo);
  - numero: 1, 2, 3… por plano, na ordem de cadastro (id), para a numeração "Ação 1 → Subação 1.1";
  - acao_pai_id: subação → ação principal (NULL nas existentes, que são todas principais);
  - criado_por_id: autor do registro de criação no histórico (ou o criador do plano, se faltar);
  - iniciada_em: 1ª vez que a ação entrou em andamento, tirada do histórico (data real de início);
  - motivo_cancelamento: justificativa do cancelamento (obrigatória para subações).
- acao_dependencia (N:N): "Depende da conclusão de". RESTRICT no pré-requisito.

Revision ID: 0016
Revises: 0015
Create Date: 2026-09-30 15:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision: str = '0016'
down_revision: Union[str, None] = '0015'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BIGINT = sa.BigInteger().with_variant(mysql.BIGINT(unsigned=True), 'mysql')


def upgrade() -> None:
    op.add_column('acoes', sa.Column('acao_pai_id', BIGINT, nullable=True))
    op.add_column('acoes', sa.Column('numero', sa.SmallInteger(), nullable=True))
    op.add_column('acoes', sa.Column('area_id', BIGINT, nullable=True))
    op.add_column('acoes', sa.Column('setor_id', BIGINT, nullable=True))
    op.add_column('acoes', sa.Column('prazo_inicio', sa.Date(), nullable=True))
    op.add_column('acoes', sa.Column('criado_por_id', BIGINT, nullable=True))
    op.add_column('acoes', sa.Column('iniciada_em', sa.DateTime(), nullable=True))
    op.add_column('acoes', sa.Column('motivo_cancelamento', sa.String(length=500), nullable=True))

    # Área/setor da ação = do plano (era o único lugar onde existia).
    op.execute(
        "UPDATE acoes a JOIN planos_de_acao p ON p.id = a.plano_id SET a.area_id = p.area_id, a.setor_id = p.setor_id"
    )
    # Numeração pela ordem de cadastro dentro do plano.
    op.execute(
        "UPDATE acoes a JOIN (SELECT id, ROW_NUMBER() OVER (PARTITION BY plano_id ORDER BY id) AS n FROM acoes) x "
        "ON x.id = a.id SET a.numero = x.n"
    )
    # Quem criou: o registro de criação do histórico; na falta, o criador do plano.
    op.execute(
        "UPDATE acoes a JOIN (SELECT acao_id, MIN(id) AS hid FROM acao_historico WHERE evento = 'criacao' GROUP BY acao_id) c "
        "ON c.acao_id = a.id JOIN acao_historico h ON h.id = c.hid SET a.criado_por_id = h.usuario_id"
    )
    op.execute(
        "UPDATE acoes a JOIN planos_de_acao p ON p.id = a.plano_id SET a.criado_por_id = p.criado_por_id "
        "WHERE a.criado_por_id IS NULL"
    )
    # Início real: 1ª entrada do histórico com o status indo para "em_andamento" (criação ou alteração).
    op.execute(
        "UPDATE acoes a JOIN (SELECT acao_id, MIN(criado_em) AS quando FROM acao_historico "
        "WHERE campo_alterado = 'status' AND valor_novo = 'em_andamento' GROUP BY acao_id) h "
        "ON h.acao_id = a.id SET a.iniciada_em = h.quando"
    )

    op.alter_column('acoes', 'numero', existing_type=sa.SmallInteger(), nullable=False)
    op.alter_column('acoes', 'area_id', existing_type=BIGINT, nullable=False)
    # Índices antes das FKs: o MySQL reaproveita o índice em vez de criar um automático.
    op.create_index(op.f('ix_acoes_acao_pai_id'), 'acoes', ['acao_pai_id'])
    op.create_index(op.f('ix_acoes_area_id'), 'acoes', ['area_id'])
    op.create_foreign_key(op.f('fk_acoes_acao_pai_id_acoes'), 'acoes', 'acoes', ['acao_pai_id'], ['id'], ondelete='CASCADE')
    op.create_foreign_key(op.f('fk_acoes_area_id_areas'), 'acoes', 'areas', ['area_id'], ['id'])
    op.create_foreign_key(op.f('fk_acoes_setor_id_setores'), 'acoes', 'setores', ['setor_id'], ['id'])
    op.create_foreign_key(op.f('fk_acoes_criado_por_id_usuarios'), 'acoes', 'usuarios', ['criado_por_id'], ['id'])

    op.create_table(
        'acao_dependencia',
        sa.Column('acao_id', BIGINT, nullable=False),
        sa.Column('depende_de_id', BIGINT, nullable=False),
        sa.ForeignKeyConstraint(['acao_id'], ['acoes.id'], name=op.f('fk_acao_dependencia_acao_id_acoes'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(
            ['depende_de_id'], ['acoes.id'], name=op.f('fk_acao_dependencia_depende_de_id_acoes'), ondelete='RESTRICT'
        ),
        sa.PrimaryKeyConstraint('acao_id', 'depende_de_id', name=op.f('pk_acao_dependencia')),
    )
    op.create_index(op.f('ix_acao_dependencia_depende_de_id'), 'acao_dependencia', ['depende_de_id'])


def downgrade() -> None:
    # Sem drop_index antes: o MySQL não remove um índice usado por FK; a tabela leva os índices junto.
    op.drop_table('acao_dependencia')
    # Subações não existem no modelo antigo: saem junto (o histórico delas vai em cascata).
    op.execute("DELETE FROM acoes WHERE acao_pai_id IS NOT NULL")
    op.drop_constraint(op.f('fk_acoes_criado_por_id_usuarios'), 'acoes', type_='foreignkey')
    op.drop_constraint(op.f('fk_acoes_setor_id_setores'), 'acoes', type_='foreignkey')
    op.drop_constraint(op.f('fk_acoes_area_id_areas'), 'acoes', type_='foreignkey')
    op.drop_constraint(op.f('fk_acoes_acao_pai_id_acoes'), 'acoes', type_='foreignkey')
    op.drop_index(op.f('ix_acoes_area_id'), table_name='acoes')
    op.drop_index(op.f('ix_acoes_acao_pai_id'), table_name='acoes')
    # Índices automáticos que o MySQL criou para as FKs sem índice próprio.
    op.execute("DROP INDEX fk_acoes_setor_id_setores ON acoes")
    op.execute("DROP INDEX fk_acoes_criado_por_id_usuarios ON acoes")
    for coluna in (
        'motivo_cancelamento', 'iniciada_em', 'criado_por_id', 'prazo_inicio', 'setor_id', 'area_id', 'numero', 'acao_pai_id'
    ):
        op.drop_column('acoes', coluna)
