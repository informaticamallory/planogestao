"""Ciclo do plano: datas estimadas, status "Não iniciado" e compatibilidade Tipo ↔ Origem

- data_abertura → data_inicio_estimado e prazo_geral → data_fim_estimado (mesmos valores: nada se perde);
  o histórico que citava os campos antigos passa a citar os novos.
- status_plano ganha "nao_iniciado". Planos "em_andamento" sem nenhuma ação aceita/iniciada/com progresso
  são reclassificados para "nao_iniciado", com registro no histórico (autor: Sistema).
- plano_historico: usuario_id aceita NULL (alteração do sistema) e ganha `motivo`.
- tipo_origem (N:N): semeada com as combinações tipo+origem que os planos já usam, para nenhum plano
  existente ficar incompatível; tipos sem plano recebem todas as origens ativas.
- Permissão de menu admin:origens para o Administrador.

Revision ID: 0015
Revises: 0014
Create Date: 2026-09-30 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision: str = '0015'
down_revision: Union[str, None] = '0014'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BIGINT = sa.BigInteger().with_variant(mysql.BIGINT(unsigned=True), 'mysql')
STATUS_ANTIGO = sa.Enum('rascunho', 'em_andamento', 'concluido', 'cancelado', name='status_plano')
STATUS_NOVO = sa.Enum('rascunho', 'nao_iniciado', 'em_andamento', 'concluido', 'cancelado', name='status_plano')
MOTIVO_MIGRACAO = 'Reclassificação: nenhuma ação aceita nem com progresso'

# Mesma regra do backend: o trabalho começou quando alguma ação foi aceita, iniciada ou tem progresso.
SEM_ACAO_INICIADA = (
    "NOT EXISTS (SELECT 1 FROM acoes a WHERE a.plano_id = p.id AND (a.aceita_em IS NOT NULL OR a.progresso > 0 "
    "OR a.status IN ('aceita', 'em_andamento', 'bloqueada', 'concluida')))"
)


def upgrade() -> None:
    conn = op.get_bind()

    # 1) Datas estimadas (renomeação: os valores são preservados).
    op.drop_index('ix_planos_de_acao_prazo_geral', table_name='planos_de_acao')
    op.alter_column('planos_de_acao', 'prazo_geral', new_column_name='data_fim_estimado',
                    existing_type=sa.Date(), existing_nullable=False)
    op.alter_column('planos_de_acao', 'data_abertura', new_column_name='data_inicio_estimado',
                    existing_type=sa.Date(), existing_nullable=False)
    op.create_index(op.f('ix_planos_de_acao_data_fim_estimado'), 'planos_de_acao', ['data_fim_estimado'], unique=False)
    conn.execute(sa.text("UPDATE plano_historico SET campo_alterado = 'data_fim_estimado' WHERE campo_alterado = 'prazo_geral'"))
    conn.execute(sa.text("UPDATE plano_historico SET campo_alterado = 'data_inicio_estimado' WHERE campo_alterado = 'data_abertura'"))

    # 2) Histórico com alterações do sistema.
    op.alter_column('plano_historico', 'usuario_id', existing_type=BIGINT, nullable=True)
    op.add_column('plano_historico', sa.Column('motivo', sa.String(length=200), nullable=True))

    # 3) Status "Não iniciado" e reclassificação dos planos que ainda não começaram.
    op.alter_column('planos_de_acao', 'status', existing_type=STATUS_ANTIGO, type_=STATUS_NOVO, existing_nullable=False)
    conn.execute(sa.text(
        "INSERT INTO plano_historico (plano_id, usuario_id, evento, campo_alterado, valor_anterior, valor_novo, motivo, criado_em) "
        f"SELECT p.id, NULL, 'alteracao', 'status', 'em_andamento', 'nao_iniciado', :motivo, now() "
        f"FROM planos_de_acao p WHERE p.status = 'em_andamento' AND {SEM_ACAO_INICIADA}"
    ), {"motivo": MOTIVO_MIGRACAO})
    conn.execute(sa.text(f"UPDATE planos_de_acao p SET p.status = 'nao_iniciado' WHERE p.status = 'em_andamento' AND {SEM_ACAO_INICIADA}"))

    # 4) Compatibilidade Tipo ↔ Origem.
    op.create_table('tipo_origem',
    sa.Column('tipo_plano_id', BIGINT, nullable=False),
    sa.Column('origem_id', BIGINT, nullable=False),
    sa.ForeignKeyConstraint(['origem_id'], ['origens_plano.id'], name=op.f('fk_tipo_origem_origem_id_origens_plano'), ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['tipo_plano_id'], ['tipos_plano.id'], name=op.f('fk_tipo_origem_tipo_plano_id_tipos_plano'), ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('tipo_plano_id', 'origem_id', name=op.f('pk_tipo_origem'))
    )
    op.create_index(op.f('ix_tipo_origem_origem_id'), 'tipo_origem', ['origem_id'], unique=False)
    conn.execute(sa.text(
        "INSERT IGNORE INTO tipo_origem (tipo_plano_id, origem_id) SELECT DISTINCT tipo_id, origem_id FROM planos_de_acao"
    ))
    conn.execute(sa.text(
        "INSERT IGNORE INTO tipo_origem (tipo_plano_id, origem_id) "
        "SELECT t.id, o.id FROM tipos_plano t JOIN origens_plano o ON o.ativo "
        "WHERE NOT EXISTS (SELECT 1 FROM tipo_origem x WHERE x.tipo_plano_id = t.id)"
    ))

    # 5) Menu Administração › Origens (o Administrador tem sempre todas as permissões do catálogo).
    conn.execute(sa.text(
        "INSERT INTO permissoes (codigo, modulo, acao, descricao) "
        "SELECT 'admin:origens', 'administracao', 'outra', 'Gerenciar origens e a compatibilidade com os tipos' "
        "WHERE NOT EXISTS (SELECT 1 FROM permissoes WHERE codigo = 'admin:origens')"
    ))
    conn.execute(sa.text(
        "INSERT IGNORE INTO perfil_permissao (perfil_id, permissao_id) "
        "SELECT pf.id, pm.id FROM perfis pf JOIN permissoes pm ON pm.codigo = 'admin:origens' "
        "WHERE pf.nome = 'Administrador'"
    ))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text(
        "DELETE pp FROM perfil_permissao pp JOIN permissoes pm ON pm.id = pp.permissao_id WHERE pm.codigo = 'admin:origens'"
    ))
    conn.execute(sa.text("DELETE FROM permissoes WHERE codigo = 'admin:origens'"))
    op.drop_index(op.f('ix_tipo_origem_origem_id'), table_name='tipo_origem')
    op.drop_table('tipo_origem')

    # Não iniciado deixa de existir: volta a "em andamento". Entradas do sistema (sem autor) não
    # cabem no esquema antigo (usuario_id NOT NULL) e são removidas.
    conn.execute(sa.text("UPDATE planos_de_acao SET status = 'em_andamento' WHERE status = 'nao_iniciado'"))
    op.alter_column('planos_de_acao', 'status', existing_type=STATUS_NOVO, type_=STATUS_ANTIGO, existing_nullable=False)
    conn.execute(sa.text("DELETE FROM plano_historico WHERE usuario_id IS NULL"))
    op.drop_column('plano_historico', 'motivo')
    op.alter_column('plano_historico', 'usuario_id', existing_type=BIGINT, nullable=False)

    conn.execute(sa.text("UPDATE plano_historico SET campo_alterado = 'prazo_geral' WHERE campo_alterado = 'data_fim_estimado'"))
    conn.execute(sa.text("UPDATE plano_historico SET campo_alterado = 'data_abertura' WHERE campo_alterado = 'data_inicio_estimado'"))
    op.drop_index(op.f('ix_planos_de_acao_data_fim_estimado'), table_name='planos_de_acao')
    op.alter_column('planos_de_acao', 'data_inicio_estimado', new_column_name='data_abertura',
                    existing_type=sa.Date(), existing_nullable=False)
    op.alter_column('planos_de_acao', 'data_fim_estimado', new_column_name='prazo_geral',
                    existing_type=sa.Date(), existing_nullable=False)
    op.create_index('ix_planos_de_acao_prazo_geral', 'planos_de_acao', ['prazo_geral'], unique=False)
