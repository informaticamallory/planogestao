"""gamificação: períodos de apuração, prêmios, encerramento com fotografia e auditoria da pontuação

- gamificacao_lancamentos ganha os dados de auditoria (categoria, regra, plano, prazo considerado),
  a situação (válido/revertido, com quem/quando/por quê) e a origem. A regra "um lançamento por item e
  usuário" vira "um lançamento VÁLIDO por item" (chave_valida única; NULL quando revertido), para a
  reabertura reverter e a nova conclusão pontuar de novo.
- Lançamentos existentes são mantidos (origem = migração), com o prazo atual da ação como prazo
  considerado. Se um item tinha mais de um lançamento (responsável trocado entre conclusões), fica
  válido o mais antigo e os demais são revertidos com o motivo registrado.
- Novas tabelas: gamificacao_periodos, gamificacao_premios, gamificacao_fotografias, gamificacao_auditoria.
- Trimestres civis do ano corrente (passados e o atual abertos; futuros planejados). Sem prêmios.
- Regras: 100 / 30 / 10 pontos (plano concluído / ação no prazo / ação fora do prazo).
- Permissões novas (o Administrador recebe todas; os demais perfis, nenhuma automaticamente).

Revision ID: 0023
Revises: 0022
Create Date: 2026-10-05 16:00:00

"""
import calendar
from datetime import date
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision: str = '0023'
down_revision: Union[str, None] = '0022'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

BIGINT = sa.BigInteger().with_variant(mysql.BIGINT(unsigned=True), 'mysql')
CATEGORIA = sa.Enum('gestor', 'executor', name='categoria_pontuacao')
SITUACAO_LANC = sa.Enum('valido', 'revertido', name='situacao_lancamento')
ORIGEM = sa.Enum('automatico', 'recalculo', 'correcao', 'regularizacao', 'migracao', name='origem_lancamento')
SITUACAO_PER = sa.Enum('planejado', 'aberto', 'encerrado', name='situacao_periodo')
EVENTO = sa.Enum('reversao', 'mantido', 'recalculo', 'correcao', 'regularizacao', 'encerramento', 'reabertura',
                 'periodo', 'premios', name='evento_auditoria_gamificacao')
REFERENCIA = sa.Enum('plano', 'acao', 'solicitacao', name='referencia_notificacao')
LANC = 'gamificacao_lancamentos'

PERMISSOES = [
    ('gamificacao:auditoria', 'visualizar', 'Consultar a auditoria da pontuação'),
    ('gamificacao:exportar', 'outra', 'Exportar a auditoria da pontuação'),
    ('gamificacao:periodos', 'editar', 'Gerenciar períodos, prêmios, regularizações e correções da pontuação'),
    ('gamificacao:encerrar', 'aprovar', 'Encerrar a apuração de um período'),
    ('gamificacao:reabrir', 'outra', 'Reabrir a apuração de um período encerrado'),
]
MESES = ('Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez')


def _trimestres(ano: int, hoje: date) -> list[dict]:
    # Mesmos nomes e datas de GamificacaoApuracao.gerar_trimestres (cópia: a migração não depende do service).
    linhas = []
    for t in range(4):
        inicio = date(ano, 3 * t + 1, 1)
        fim = date(ano, 3 * t + 3, calendar.monthrange(ano, 3 * t + 3)[1])
        linhas.append({
            'nome': f'{t + 1}º trimestre {ano} ({MESES[3 * t]}–{MESES[3 * t + 2]})', 'ano': ano,
            'data_inicio': inicio, 'data_fim': fim, 'situacao': 'aberto' if inicio <= hoje else 'planejado',
        })
    return linhas


def upgrade() -> None:
    # 1) Extrato com dados de auditoria e situação.
    op.add_column(LANC, sa.Column('categoria', CATEGORIA, nullable=True))
    op.add_column(LANC, sa.Column('regra_nome', sa.String(length=100), nullable=True))
    op.add_column(LANC, sa.Column('plano_id', sa.BigInteger(), nullable=True))
    op.add_column(LANC, sa.Column('prazo_considerado', sa.Date(), nullable=True))
    op.add_column(LANC, sa.Column('situacao', SITUACAO_LANC, server_default='valido', nullable=False))
    op.add_column(LANC, sa.Column('chave_valida', sa.String(length=40), nullable=True))
    op.add_column(LANC, sa.Column('origem', ORIGEM, server_default='automatico', nullable=False))
    op.add_column(LANC, sa.Column('criado_por_id', BIGINT, nullable=True))
    op.add_column(LANC, sa.Column('revertido_em', sa.DateTime(), nullable=True))
    op.add_column(LANC, sa.Column('revertido_por_id', BIGINT, nullable=True))
    op.add_column(LANC, sa.Column('motivo_reversao', sa.String(length=500), nullable=True))
    op.create_foreign_key(op.f('fk_gamificacao_lancamentos_criado_por_id_usuarios'), LANC, 'usuarios', ['criado_por_id'], ['id'])
    op.create_foreign_key(op.f('fk_gamificacao_lancamentos_revertido_por_id_usuarios'), LANC, 'usuarios', ['revertido_por_id'], ['id'])

    op.execute(f"UPDATE {LANC} SET categoria = CASE WHEN gatilho = 'plano_concluido' THEN 'gestor' ELSE 'executor' END, origem = 'migracao'")
    op.execute(f"UPDATE {LANC} SET regra_nome = (SELECT r.nome FROM gamificacao_regras r WHERE r.id = {LANC}.regra_id)")
    op.execute(f"UPDATE {LANC} SET plano_id = referencia_id WHERE referencia_tipo = 'plano'")
    op.execute(
        f"UPDATE {LANC} SET plano_id = COALESCE((SELECT a.plano_id FROM acoes a WHERE a.id = {LANC}.referencia_id), 0), "
        f"prazo_considerado = (SELECT a.prazo FROM acoes a WHERE a.id = {LANC}.referencia_id) WHERE referencia_tipo = 'acao'"
    )
    # Um válido por item: o mais antigo. (Tabela derivada: o MySQL não lê a própria tabela do UPDATE.)
    op.execute(
        f"UPDATE {LANC} SET chave_valida = CONCAT(referencia_tipo, ':', referencia_id) WHERE id IN "
        f"(SELECT m FROM (SELECT MIN(id) AS m FROM {LANC} GROUP BY referencia_tipo, referencia_id) AS primeiros)"
    )
    op.execute(
        f"UPDATE {LANC} SET situacao = 'revertido', revertido_em = now(), "
        "motivo_reversao = 'Migração 0023: o item já tinha um lançamento válido mais antigo (um por item).' "
        "WHERE chave_valida IS NULL"
    )
    op.alter_column(LANC, 'categoria', existing_type=CATEGORIA, nullable=False)
    op.alter_column(LANC, 'regra_nome', existing_type=sa.String(length=100), nullable=False)
    op.alter_column(LANC, 'plano_id', existing_type=sa.BigInteger(), nullable=False)
    op.drop_constraint('uq_gamificacao_lancamentos_referencia_usuario', LANC, type_='unique')
    op.create_unique_constraint(op.f('uq_gamificacao_lancamentos_chave_valida'), LANC, ['chave_valida'])
    op.create_index(op.f('ix_gamificacao_lancamentos_plano_id'), LANC, ['plano_id'], unique=False)

    # 2) Períodos, prêmios, fotografias e auditoria.
    op.create_table('gamificacao_periodos',
        sa.Column('id', BIGINT, autoincrement=True, nullable=False),
        sa.Column('nome', sa.String(length=60), nullable=False),
        sa.Column('ano', sa.SmallInteger(), nullable=False),
        sa.Column('data_inicio', sa.Date(), nullable=False),
        sa.Column('data_fim', sa.Date(), nullable=False),
        sa.Column('situacao', SITUACAO_PER, nullable=False),
        sa.Column('encerrado_em', sa.DateTime(), nullable=True),
        sa.Column('encerrado_por_id', BIGINT, nullable=True),
        sa.Column('criado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('atualizado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['encerrado_por_id'], ['usuarios.id'], name=op.f('fk_gamificacao_periodos_encerrado_por_id_usuarios')),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_gamificacao_periodos')),
        sa.UniqueConstraint('nome', name='uq_gamificacao_periodos_nome'),
    )
    op.create_index(op.f('ix_gamificacao_periodos_ano'), 'gamificacao_periodos', ['ano'], unique=False)
    op.create_table('gamificacao_premios',
        sa.Column('id', BIGINT, autoincrement=True, nullable=False),
        sa.Column('periodo_id', BIGINT, nullable=False),
        sa.Column('categoria', CATEGORIA, nullable=False),
        sa.Column('colocacao', sa.SmallInteger(), nullable=False),
        sa.Column('nome', sa.String(length=100), nullable=False),
        sa.Column('descricao', sa.String(length=500), nullable=True),
        sa.Column('valor', sa.Numeric(precision=12, scale=2), nullable=True),
        sa.Column('criado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('atualizado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['periodo_id'], ['gamificacao_periodos.id'], name=op.f('fk_gamificacao_premios_periodo_id_gamificacao_periodos'), ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_gamificacao_premios')),
        sa.UniqueConstraint('periodo_id', 'categoria', 'colocacao', name='uq_gamificacao_premios_colocacao'),
    )
    op.create_table('gamificacao_fotografias',
        sa.Column('id', BIGINT, autoincrement=True, nullable=False),
        sa.Column('periodo_id', BIGINT, nullable=False),
        sa.Column('dados', sa.JSON(), nullable=False),
        sa.Column('criado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.Column('criado_por_id', BIGINT, nullable=True),
        sa.Column('substituida_em', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['periodo_id'], ['gamificacao_periodos.id'], name=op.f('fk_gamificacao_fotografias_periodo_id_gamificacao_periodos'), ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['criado_por_id'], ['usuarios.id'], name=op.f('fk_gamificacao_fotografias_criado_por_id_usuarios')),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_gamificacao_fotografias')),
    )
    op.create_index(op.f('ix_gamificacao_fotografias_periodo_id'), 'gamificacao_fotografias', ['periodo_id'], unique=False)
    op.create_table('gamificacao_auditoria',
        sa.Column('id', BIGINT, autoincrement=True, nullable=False),
        sa.Column('evento', EVENTO, nullable=False),
        sa.Column('periodo_id', BIGINT, nullable=True),
        sa.Column('lancamento_id', BIGINT, nullable=True),
        sa.Column('referencia_tipo', REFERENCIA, nullable=True),
        sa.Column('referencia_id', sa.BigInteger(), nullable=True),
        sa.Column('autor_id', BIGINT, nullable=True),
        sa.Column('justificativa', sa.String(length=500), nullable=True),
        sa.Column('detalhe', sa.String(length=1000), nullable=False),
        sa.Column('criado_em', sa.DateTime(), server_default=sa.text('now()'), nullable=False),
        sa.ForeignKeyConstraint(['periodo_id'], ['gamificacao_periodos.id'], name=op.f('fk_gamificacao_auditoria_periodo_id_gamificacao_periodos'), ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['lancamento_id'], [f'{LANC}.id'], name=op.f('fk_gamificacao_auditoria_lancamento_id_gamificacao_lancamentos')),
        sa.ForeignKeyConstraint(['autor_id'], ['usuarios.id'], name=op.f('fk_gamificacao_auditoria_autor_id_usuarios')),
        sa.PrimaryKeyConstraint('id', name=op.f('pk_gamificacao_auditoria')),
    )
    op.create_index(op.f('ix_gamificacao_auditoria_evento'), 'gamificacao_auditoria', ['evento'], unique=False)
    op.create_index(op.f('ix_gamificacao_auditoria_periodo_id'), 'gamificacao_auditoria', ['periodo_id'], unique=False)
    op.create_index(op.f('ix_gamificacao_auditoria_criado_em'), 'gamificacao_auditoria', ['criado_em'], unique=False)

    hoje = date.today()
    periodos = sa.table('gamificacao_periodos', sa.column('nome', sa.String), sa.column('ano', sa.SmallInteger),
                        sa.column('data_inicio', sa.Date), sa.column('data_fim', sa.Date), sa.column('situacao', sa.String))
    op.bulk_insert(periodos, _trimestres(hoje.year, hoje))

    # 3) Pontuação da regra de apuração.
    for gatilho, pontos in (('plano_concluido', 100), ('acao_no_prazo', 30), ('acao_fora_do_prazo', 10)):
        op.execute(f"UPDATE gamificacao_regras SET pontos = {pontos}, ativo = true WHERE gatilho = '{gatilho}'")

    # 4) Permissões: só o Administrador recebe.
    for codigo, acao, descricao in PERMISSOES:
        op.execute(
            "INSERT INTO permissoes (codigo, modulo, acao, descricao) "
            f"SELECT '{codigo}', 'gamificacao', '{acao}', '{descricao}' "
            f"WHERE NOT EXISTS (SELECT 1 FROM permissoes WHERE codigo = '{codigo}')"
        )
        op.execute(
            "INSERT INTO perfil_permissao (perfil_id, permissao_id) "
            f"SELECT pf.id, pm.id FROM perfis pf JOIN permissoes pm ON pm.codigo = '{codigo}' WHERE pf.nome = 'Administrador' "
            "AND NOT EXISTS (SELECT 1 FROM perfil_permissao x WHERE x.perfil_id = pf.id AND x.permissao_id = pm.id)"
        )


def downgrade() -> None:
    lista = ", ".join(f"'{c}'" for c, _, _ in PERMISSOES)
    op.execute(f"DELETE FROM perfil_permissao WHERE permissao_id IN (SELECT id FROM permissoes WHERE codigo IN ({lista}))")
    op.execute(f"DELETE FROM permissoes WHERE codigo IN ({lista})")
    op.drop_table('gamificacao_auditoria')
    op.drop_table('gamificacao_fotografias')
    op.drop_table('gamificacao_premios')
    op.drop_table('gamificacao_periodos')

    # O esquema antigo só comporta um lançamento por item e usuário: saem os revertidos e os posteriores.
    op.execute(f"DELETE FROM {LANC} WHERE situacao = 'revertido'")
    op.drop_index(op.f('ix_gamificacao_lancamentos_plano_id'), table_name=LANC)
    op.drop_constraint(op.f('uq_gamificacao_lancamentos_chave_valida'), LANC, type_='unique')
    op.create_unique_constraint('uq_gamificacao_lancamentos_referencia_usuario', LANC, ['referencia_tipo', 'referencia_id', 'usuario_id'])
    op.drop_constraint(op.f('fk_gamificacao_lancamentos_revertido_por_id_usuarios'), LANC, type_='foreignkey')
    op.drop_constraint(op.f('fk_gamificacao_lancamentos_criado_por_id_usuarios'), LANC, type_='foreignkey')
    for coluna in ('motivo_reversao', 'revertido_por_id', 'revertido_em', 'criado_por_id', 'origem', 'chave_valida',
                   'situacao', 'prazo_considerado', 'plano_id', 'regra_nome', 'categoria'):
        op.drop_column(LANC, coluna)
