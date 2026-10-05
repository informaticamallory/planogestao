from datetime import date, datetime

from sqlalchemy import ColumnElement, Row, and_, func, or_, select, true
from sqlalchemy.orm import Session, aliased

from app.models import Acao, AcaoHistorico, PlanoDeAcao, Usuario
from app.models.enums import STATUS_ACAO_ABERTOS, STATUS_ACAO_DESCARTADOS, StatusPlano
from app.repositories.consultas_comuns import agregado_acoes_por_plano


class DashboardRepository:
    """Consultas enxutas (só as colunas necessárias); a agregação por regra fica no service."""

    def __init__(self, db: Session, filtro_visibilidade: ColumnElement[bool]):
        self.db = db
        self.visivel = filtro_visibilidade

    def planos_criados_entre(self, inicio: datetime, fim: datetime) -> list[Row]:
        return list(
            self.db.execute(
                select(PlanoDeAcao.status, PlanoDeAcao.data_fim_estimado).where(
                    self.visivel, PlanoDeAcao.criado_em >= inicio, PlanoDeAcao.criado_em < fim
                )
            )
        )

    def planos_para_evolucao(self, inicio: datetime, fim: datetime, dia_ini: date, dia_fim: date) -> list[Row]:
        """Planos criados, concluídos ou com fim estimado dentro do período."""
        return list(
            self.db.execute(
                select(
                    PlanoDeAcao.status,
                    PlanoDeAcao.data_fim_estimado,
                    PlanoDeAcao.criado_em,
                    PlanoDeAcao.concluido_em,
                ).where(
                    self.visivel,
                    or_(
                        and_(PlanoDeAcao.criado_em >= inicio, PlanoDeAcao.criado_em < fim),
                        and_(PlanoDeAcao.concluido_em >= inicio, PlanoDeAcao.concluido_em < fim),
                        PlanoDeAcao.data_fim_estimado.between(dia_ini, dia_fim),
                    ),
                )
            )
        )

    def acoes_criadas_entre(self, inicio: datetime, fim: datetime) -> list[Row]:
        return list(
            self.db.execute(
                select(Acao.status, Acao.prazo, Acao.concluida_em)
                .join(PlanoDeAcao, Acao.plano_id == PlanoDeAcao.id)
                # Subações não entram nos números do painel.
                .where(self.visivel, Acao.criado_em >= inicio, Acao.criado_em < fim, Acao.acao_pai_id.is_(None))
            )
        )

    def subitens_criados_entre(self, inicio: datetime, fim: datetime) -> list[Row]:
        """Sub-itens (todos os níveis) criados no período, sem recusados/cancelados: cada um uma vez."""
        return list(
            self.db.execute(
                select(Acao.status, Acao.prazo)
                .join(PlanoDeAcao, Acao.plano_id == PlanoDeAcao.id)
                .where(
                    self.visivel,
                    Acao.criado_em >= inicio,
                    Acao.criado_em < fim,
                    Acao.acao_pai_id.is_not(None),
                    Acao.status.not_in(STATUS_ACAO_DESCARTADOS),
                )
            )
        )

    def progresso_planos_criados_entre(self, inicio: datetime, fim: datetime) -> list[float]:
        """Progresso de cada plano criado no período (média das ações; 0 sem ações), como na listagem."""
        agregado = agregado_acoes_por_plano()
        return [
            float(p)
            for p in self.db.scalars(
                select(func.coalesce(agregado.c.progresso, 0))
                .select_from(PlanoDeAcao)
                .outerjoin(agregado, agregado.c.plano_id == PlanoDeAcao.id)
                .where(self.visivel, PlanoDeAcao.criado_em >= inicio, PlanoDeAcao.criado_em < fim)
            )
        ]

    def acoes_com_prazo_entre(self, dia_ini: date, dia_fim: date) -> list[Row]:
        return list(
            self.db.execute(
                select(Acao.status, Acao.prazo)
                .join(PlanoDeAcao, Acao.plano_id == PlanoDeAcao.id)
                .where(
                    self.visivel,
                    Acao.prazo.between(dia_ini, dia_fim),
                    Acao.status.not_in(STATUS_ACAO_DESCARTADOS),
                    Acao.acao_pai_id.is_(None),
                )
            )
        )

    def planos_recentes(self, inicio: datetime, fim: datetime, limite: int) -> list[Row]:
        agregado = agregado_acoes_por_plano()
        responsavel = aliased(Usuario)
        return list(
            self.db.execute(
                select(
                    PlanoDeAcao.id,
                    PlanoDeAcao.codigo,
                    PlanoDeAcao.nome,
                    PlanoDeAcao.status,
                    PlanoDeAcao.data_fim_estimado,
                    PlanoDeAcao.criado_em,
                    responsavel.id.label("responsavel_id"),
                    responsavel.nome.label("responsavel_nome"),
                    func.coalesce(agregado.c.total_acoes, 0).label("total_acoes"),
                    func.coalesce(agregado.c.acoes_concluidas, 0).label("acoes_concluidas"),
                    func.coalesce(agregado.c.progresso, 0).label("progresso"),
                )
                .join(responsavel, PlanoDeAcao.responsavel_id == responsavel.id)
                .outerjoin(agregado, agregado.c.plano_id == PlanoDeAcao.id)
                .where(self.visivel, PlanoDeAcao.criado_em >= inicio, PlanoDeAcao.criado_em < fim)
                .order_by(PlanoDeAcao.criado_em.desc(), PlanoDeAcao.id.desc())
                .limit(limite)
            )
        )

    def atividades_recentes(self, inicio: datetime, fim: datetime, limite: int) -> list[Row]:
        return list(
            self.db.execute(
                select(
                    AcaoHistorico.id,
                    AcaoHistorico.evento,
                    AcaoHistorico.campo_alterado,
                    AcaoHistorico.valor_anterior,
                    AcaoHistorico.valor_novo,
                    AcaoHistorico.detalhe,
                    AcaoHistorico.criado_em,
                    Usuario.id.label("usuario_id"),
                    Usuario.nome.label("usuario_nome"),
                    Acao.id.label("acao_id"),
                    Acao.descricao.label("acao_descricao"),
                    PlanoDeAcao.id.label("plano_id"),
                    PlanoDeAcao.codigo.label("plano_codigo"),
                    PlanoDeAcao.nome.label("plano_nome"),
                )
                .join(Acao, AcaoHistorico.acao_id == Acao.id)
                .join(PlanoDeAcao, Acao.plano_id == PlanoDeAcao.id)
                .join(Usuario, AcaoHistorico.usuario_id == Usuario.id)
                .where(self.visivel, AcaoHistorico.criado_em >= inicio, AcaoHistorico.criado_em < fim)
                .order_by(AcaoHistorico.criado_em.desc(), AcaoHistorico.id.desc())
                .limit(limite)
            )
        )

    def acoes_abertas_do_usuario(self, usuario_id: int, limite: int, areas: ColumnElement[bool] | None = None) -> list[Row]:
        return list(
            self.db.execute(
                select(
                    Acao.id,
                    Acao.descricao,
                    Acao.status,
                    Acao.prioridade,
                    Acao.prazo,
                    Acao.progresso,
                    PlanoDeAcao.id.label("plano_id"),
                    PlanoDeAcao.codigo.label("plano_codigo"),
                    PlanoDeAcao.nome.label("plano_nome"),
                )
                .join(PlanoDeAcao, Acao.plano_id == PlanoDeAcao.id)
                .where(Acao.responsavel_id == usuario_id, Acao.status.in_(STATUS_ACAO_ABERTOS), areas if areas is not None else true())
                .order_by(Acao.prazo.asc(), Acao.id.asc())
                .limit(limite)
            )
        )
