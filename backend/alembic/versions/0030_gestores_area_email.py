"""gestores por área: cópia oculta dos e-mails de notificação por área

- gestores_area_email: vínculo área × gestor (único), com o recebimento ativado/desativado. Só define quem
  recebe a cópia; não altera as áreas autorizadas do usuário.
- envios_email.cco_area_regra: a regra gravada no enfileiramento (área do evento, área do plano e quem já é
  destinatário principal); os endereços são resolvidos no envio.
- envios_email.cco_area: os endereços de gestores usados na última tentativa (auditoria).

Nenhum dado existente muda: os e-mails já registrados ficam sem a regra (enviados como antes).

Revision ID: 0030
Revises: 0029
Create Date: 2026-10-13 10:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision: str = '0030'
down_revision: Union[str, None] = '0029'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BigInt = sa.BigInteger().with_variant(mysql.BIGINT(unsigned=True), "mysql")


def upgrade() -> None:
    op.create_table(
        'gestores_area_email',
        sa.Column('id', BigInt, autoincrement=True, nullable=False),
        sa.Column('area_id', BigInt, nullable=False),
        sa.Column('usuario_id', BigInt, nullable=False),
        sa.Column('ativo', sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column('atualizado_por_id', BigInt, nullable=True),
        sa.Column('criado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('atualizado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['area_id'], ['areas.id'], name=op.f('fk_gestores_area_email_area_id_areas'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], name=op.f('fk_gestores_area_email_usuario_id_usuarios'),
                                ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['atualizado_por_id'], ['usuarios.id'], name=op.f('fk_gestores_area_email_atualizado_por_id_usuarios'),
                                ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_gestores_area_email')),
        sa.UniqueConstraint('area_id', 'usuario_id', name=op.f('uq_gestores_area_email_area_id_usuario_id')),
    )
    op.create_index(op.f('ix_gestores_area_email_area_id'), 'gestores_area_email', ['area_id'], unique=False)
    op.create_index(op.f('ix_gestores_area_email_usuario_id'), 'gestores_area_email', ['usuario_id'], unique=False)
    op.add_column('envios_email', sa.Column('cco_area_regra', sa.JSON(), nullable=True))
    op.add_column('envios_email', sa.Column('cco_area', sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column('envios_email', 'cco_area')
    op.drop_column('envios_email', 'cco_area_regra')
    op.drop_index(op.f('ix_gestores_area_email_usuario_id'), table_name='gestores_area_email')
    op.drop_index(op.f('ix_gestores_area_email_area_id'), table_name='gestores_area_email')
    op.drop_table('gestores_area_email')
