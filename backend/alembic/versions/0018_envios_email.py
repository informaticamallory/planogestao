"""envios_email (fila e registro dos e-mails de notificação)

Revision ID: 0018
Revises: 0017
Create Date: 2026-10-01 14:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision: str = '0018'
down_revision: Union[str, None] = '0017'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BIGINT = sa.BigInteger().with_variant(mysql.BIGINT(unsigned=True), 'mysql')
TEXTO_LONGO = sa.Text().with_variant(mysql.MEDIUMTEXT(), 'mysql')


def upgrade() -> None:
    op.create_table('envios_email',
    sa.Column('id', BIGINT, autoincrement=True, nullable=False),
    sa.Column('chave', sa.String(length=191), nullable=False),
    sa.Column('evento', sa.String(length=40), nullable=False),
    sa.Column('referencia_tipo', sa.String(length=10), nullable=False),
    sa.Column('referencia_id', sa.BigInteger(), nullable=False),
    sa.Column('usuario_id', BIGINT, nullable=True),
    sa.Column('destinatario', sa.String(length=255), nullable=True),
    sa.Column('assunto', sa.String(length=255), nullable=False),
    sa.Column('corpo_html', TEXTO_LONGO, nullable=False),
    sa.Column('corpo_texto', TEXTO_LONGO, nullable=False),
    sa.Column('situacao', sa.String(length=20), nullable=False),
    sa.Column('tentativas', sa.Integer(), server_default='0', nullable=False),
    sa.Column('proxima_tentativa_em', sa.DateTime(), nullable=True),
    sa.Column('processando_desde', sa.DateTime(), nullable=True),
    sa.Column('ultimo_erro', sa.Text(), nullable=True),
    sa.Column('enviado_em', sa.DateTime(), nullable=True),
    sa.Column('criado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.Column('atualizado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], name=op.f('fk_envios_email_usuario_id_usuarios'), ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_envios_email')),
    sa.UniqueConstraint('chave', name=op.f('uq_envios_email_chave'))
    )
    op.create_index(op.f('ix_envios_email_usuario_id'), 'envios_email', ['usuario_id'], unique=False)
    op.create_index('ix_envios_email_situacao_proxima', 'envios_email', ['situacao', 'proxima_tentativa_em'], unique=False)


def downgrade() -> None:
    # Remover a tabela já leva os índices (o MySQL não deixa apagar antes o índice usado pela FK).
    op.drop_table('envios_email')
