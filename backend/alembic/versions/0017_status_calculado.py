"""Status globais calculados pelas ações; rascunho e arquivado como condições à parte

- planos_de_acao ganha `rascunho` (bool): os planos em status "rascunho" viram rascunho = sim.
- "cancelado" deixa de ser status: os planos cancelados são ARQUIVADOS (quem arquivou = quem cancelou,
  pelo histórico; na falta, o responsável), com um evento de arquivamento que explica a origem.
- O status passa a ser o calculado pelas ações principais (sem canceladas/recusadas):
  nenhuma iniciada → nao_iniciado; alguma iniciada/concluída com pendências → em_andamento;
  todas concluídas → concluido. Cada plano que muda ganha um registro no histórico (autor: Sistema).
- status_plano fica só com nao_iniciado | em_andamento | concluido.

O histórico antigo (com "rascunho"/"cancelado" nos valores) é preservado como estava.

Revision ID: 0017
Revises: 0016
Create Date: 2026-09-30 18:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = '0017'
down_revision: Union[str, None] = '0016'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

STATUS_ANTIGO = sa.Enum('rascunho', 'nao_iniciado', 'em_andamento', 'concluido', 'cancelado', name='status_plano')
STATUS_NOVO = sa.Enum('nao_iniciado', 'em_andamento', 'concluido', name='status_plano')
MOTIVO_PADRONIZACAO = 'Padronização dos status: calculado pelas ações'
MOTIVO_ARQUIVADO = 'Plano cancelado: o status Cancelado deixou de existir e o plano foi arquivado para consulta'

_VALIDAS = "FROM acoes a WHERE a.plano_id = p.id AND a.acao_pai_id IS NULL AND a.status NOT IN ('cancelada', 'recusada')"
STATUS_CALCULADO = (
    "CASE "
    f"WHEN NOT EXISTS (SELECT 1 {_VALIDAS}) THEN 'nao_iniciado' "
    f"WHEN NOT EXISTS (SELECT 1 {_VALIDAS} AND a.status <> 'concluida') THEN 'concluido' "
    f"WHEN EXISTS (SELECT 1 {_VALIDAS} AND a.status IN ('em_andamento', 'bloqueada', 'concluida')) THEN 'em_andamento' "
    "ELSE 'nao_iniciado' END"
)
QUEM_CANCELOU = (
    "(SELECT h.usuario_id FROM plano_historico h WHERE h.plano_id = p.id AND h.campo_alterado = 'status' "
    "AND h.valor_novo = 'cancelado' AND h.usuario_id IS NOT NULL ORDER BY h.criado_em DESC, h.id DESC LIMIT 1)"
)


def upgrade() -> None:
    op.add_column('planos_de_acao', sa.Column('rascunho', sa.Boolean(), server_default=sa.false(), nullable=False))
    op.execute("UPDATE planos_de_acao SET rascunho = 1 WHERE status = 'rascunho'")

    # Cancelados → arquivados (preservando ações, histórico e anexos).
    op.execute(
        "INSERT INTO plano_historico (plano_id, usuario_id, evento, motivo, criado_em) "
        f"SELECT p.id, COALESCE({QUEM_CANCELOU}, p.responsavel_id), 'arquivamento', '{MOTIVO_ARQUIVADO}', NOW() "
        "FROM planos_de_acao p WHERE p.status = 'cancelado' AND p.arquivado_em IS NULL"
    )
    op.execute(
        f"UPDATE planos_de_acao p SET p.arquivado_por_id = COALESCE({QUEM_CANCELOU}, p.responsavel_id), "
        "p.arquivado_em = COALESCE(p.atualizado_em, NOW()) WHERE p.status = 'cancelado' AND p.arquivado_em IS NULL"
    )

    # Status calculado, com histórico de cada mudança (o valor anterior fica registrado).
    op.execute(
        "INSERT INTO plano_historico (plano_id, usuario_id, evento, campo_alterado, valor_anterior, valor_novo, motivo, criado_em) "
        f"SELECT p.id, NULL, 'alteracao', 'status', p.status, {STATUS_CALCULADO}, '{MOTIVO_PADRONIZACAO}', NOW() "
        f"FROM planos_de_acao p WHERE p.status <> ({STATUS_CALCULADO})"
    )
    op.execute(
        "UPDATE planos_de_acao p SET p.concluido_em = (SELECT MAX(a.concluida_em) FROM acoes a WHERE a.plano_id = p.id) "
        f"WHERE p.concluido_em IS NULL AND ({STATUS_CALCULADO}) = 'concluido'"
    )
    op.execute(f"UPDATE planos_de_acao p SET p.concluido_em = NULL WHERE ({STATUS_CALCULADO}) <> 'concluido'")
    op.execute(f"UPDATE planos_de_acao p SET p.status = ({STATUS_CALCULADO}) WHERE p.status <> ({STATUS_CALCULADO})")

    op.alter_column(
        'planos_de_acao', 'status', existing_type=STATUS_ANTIGO, type_=STATUS_NOVO,
        existing_nullable=False, server_default=None,
    )


def downgrade() -> None:
    op.alter_column('planos_de_acao', 'status', existing_type=STATUS_NOVO, type_=STATUS_ANTIGO, existing_nullable=False)
    # Volta o status anterior à padronização e desfaz o arquivamento feito por ela.
    op.execute(
        "UPDATE planos_de_acao p JOIN plano_historico h ON h.plano_id = p.id "
        f"AND h.motivo = '{MOTIVO_PADRONIZACAO}' SET p.status = h.valor_anterior"
    )
    op.execute(f"DELETE FROM plano_historico WHERE motivo = '{MOTIVO_PADRONIZACAO}'")
    op.execute(
        "UPDATE planos_de_acao p JOIN plano_historico h ON h.plano_id = p.id "
        f"AND h.motivo = '{MOTIVO_ARQUIVADO}' SET p.status = 'cancelado', p.arquivado_em = NULL, p.arquivado_por_id = NULL"
    )
    op.execute(f"DELETE FROM plano_historico WHERE motivo = '{MOTIVO_ARQUIVADO}'")
    op.execute("UPDATE planos_de_acao SET status = 'rascunho' WHERE rascunho = 1")
    op.drop_column('planos_de_acao', 'rascunho')
