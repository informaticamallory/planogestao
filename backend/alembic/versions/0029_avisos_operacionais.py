"""avisos operacionais: preferências por tipo, resumo semanal, revalidação e tentativas dos e-mails

- preferencias_notificacao: canais (sistema/e-mail) escolhidos por usuário e tipo de aviso. Sem linha = padrão.
- resumos_semanais_plano: cada resumo semanal gerado (plano + período), com o progresso no fechamento — base
  da evolução da semana seguinte e trava contra resumo duplicado.
- envios_email.contexto: o que revalidar antes de enviar (acesso, prazo e responsável vigentes).
- envios_email_tentativas: auditoria de cada tentativa (enviado, falhou, cancelado na revalidação).

Nenhum dado existente muda: os e-mails já registrados ficam sem contexto (enviados como antes).

Revision ID: 0029
Revises: 0028
Create Date: 2026-10-07 18:00:00

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision: str = '0029'
down_revision: Union[str, None] = '0028'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BigInt = sa.BigInteger().with_variant(mysql.BIGINT(unsigned=True), "mysql")


def upgrade() -> None:
    op.create_table(
        'preferencias_notificacao',
        sa.Column('usuario_id', BigInt, nullable=False),
        sa.Column('tipo', sa.String(length=50), nullable=False),
        sa.Column('sistema', sa.Boolean(), nullable=False),
        sa.Column('email', sa.Boolean(), nullable=False),
        sa.Column('atualizado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], name=op.f('fk_preferencias_notificacao_usuario_id_usuarios'),
                                ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('usuario_id', 'tipo', name=op.f('pk_preferencias_notificacao')),
    )
    op.create_table(
        'resumos_semanais_plano',
        sa.Column('id', BigInt, autoincrement=True, nullable=False),
        sa.Column('plano_id', BigInt, nullable=False),
        sa.Column('usuario_id', BigInt, nullable=True),
        sa.Column('periodo_inicio', sa.Date(), nullable=False),
        sa.Column('periodo_fim', sa.Date(), nullable=False),
        sa.Column('progresso', sa.SmallInteger(), nullable=False),
        sa.Column('gerado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['plano_id'], ['planos_de_acao.id'], name=op.f('fk_resumos_semanais_plano_plano_id_planos_de_acao'),
                                ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['usuario_id'], ['usuarios.id'], name=op.f('fk_resumos_semanais_plano_usuario_id_usuarios'),
                                ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_resumos_semanais_plano')),
        sa.UniqueConstraint('plano_id', 'periodo_fim', name=op.f('uq_resumos_semanais_plano_plano_id_periodo_fim')),
    )
    op.create_index(op.f('ix_resumos_semanais_plano_gerado_em'), 'resumos_semanais_plano', ['gerado_em'], unique=False)
    op.add_column('envios_email', sa.Column('contexto', sa.JSON(), nullable=True))
    op.create_table(
        'envios_email_tentativas',
        sa.Column('id', BigInt, autoincrement=True, nullable=False),
        sa.Column('envio_id', BigInt, nullable=False),
        sa.Column('numero', sa.Integer(), nullable=False),
        sa.Column('resultado', sa.String(length=20), nullable=False),
        sa.Column('erro', sa.Text(), nullable=True),
        sa.Column('criado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['envio_id'], ['envios_email.id'], name=op.f('fk_envios_email_tentativas_envio_id_envios_email'),
                                ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_envios_email_tentativas')),
    )
    op.create_index(op.f('ix_envios_email_tentativas_envio_id'), 'envios_email_tentativas', ['envio_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_envios_email_tentativas_envio_id'), table_name='envios_email_tentativas')
    op.drop_table('envios_email_tentativas')
    op.drop_column('envios_email', 'contexto')
    op.drop_index(op.f('ix_resumos_semanais_plano_gerado_em'), table_name='resumos_semanais_plano')
    op.drop_table('resumos_semanais_plano')
    op.drop_table('preferencias_notificacao')
