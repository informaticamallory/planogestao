"""Regras de classificação de planos e ações (fonte única para dashboard, listagens e calendário)."""

import enum
from datetime import date, datetime, timedelta

from app.core.tempo import data_local
from app.models.enums import STATUS_ACAO_ABERTOS, STATUS_PLANO_EM_EXECUCAO, StatusAcao, StatusPlano
from app.services.configuracoes import valor_inteiro


def dias_alerta_vencimento() -> int:
    """Antecedência dos AVISOS de vencimento de ações (notificações). Parâmetro de Configurações.
    Não muda a tag de prazo, que usa a janela fixa DIAS_A_VENCER."""
    return valor_inteiro("dias_alerta_vencimento_acao")


# Tag "A vencer": prazo de conclusão entre hoje e hoje + 3 dias (inclusive). Fixo para PA, ação e subação.
DIAS_A_VENCER = 3


class TagPrazo(str, enum.Enum):
    """Situação do prazo, separada do status global. Datas locais, sem horas.
    Itens concluídos (ou descartados) não têm tag: o atraso não fica ativo depois da conclusão."""

    EM_ATRASO = "em_atraso"  # prazo de conclusão antes de hoje
    A_VENCER = "a_vencer"  # vence hoje ou nos próximos DIAS_A_VENCER dias
    NO_PRAZO = "no_prazo"  # depois dessa janela
    SEM_PRAZO = "sem_prazo"  # informação neutra


def tag_prazo(aberto: bool, prazo: date | None, hoje: date) -> TagPrazo | None:
    if not aberto:
        return None
    if prazo is None:
        return TagPrazo.SEM_PRAZO
    if prazo < hoje:
        return TagPrazo.EM_ATRASO
    if prazo <= hoje + timedelta(days=DIAS_A_VENCER):
        return TagPrazo.A_VENCER
    return TagPrazo.NO_PRAZO


def tag_prazo_acao(status: StatusAcao, prazo: date | None, hoje: date) -> TagPrazo | None:
    return tag_prazo(status in STATUS_ACAO_ABERTOS, prazo, hoje)


def tag_prazo_plano(status: StatusPlano, data_fim_estimado: date | None, hoje: date) -> TagPrazo | None:
    return tag_prazo(status != StatusPlano.CONCLUIDO, data_fim_estimado, hoje)


class CategoriaAcao(str, enum.Enum):
    """Status de execução da ação/sub-item (gráficos e contadores): só estes 3, mutuamente exclusivos.
    O prazo não é status: a situação do prazo é a TagPrazo, contada à parte."""

    PENDENTE = "pendente"  # Não iniciado: aguardando aceite ou aceita
    EM_ANDAMENTO = "em_andamento"  # Em andamento: em andamento ou bloqueada
    CONCLUIDA = "concluida"  # Concluído


def categoria_acao(status: StatusAcao, prazo: date, hoje: date) -> CategoriaAcao | None:
    """None para ações recusadas/canceladas, que ficam fora dos indicadores.
    Depende só do status gravado: o vencimento do prazo não muda a categoria."""
    if status == StatusAcao.CONCLUIDA:
        return CategoriaAcao.CONCLUIDA
    if status not in STATUS_ACAO_ABERTOS:
        return None
    if status in (StatusAcao.EM_ANDAMENTO, StatusAcao.BLOQUEADA):
        return CategoriaAcao.EM_ANDAMENTO
    return CategoriaAcao.PENDENTE


def acao_vencendo(status: StatusAcao, prazo: date, hoje: date) -> bool:
    """Tag "A vencer" (mesma janela da tag de prazo)."""
    return tag_prazo_acao(status, prazo, hoje) == TagPrazo.A_VENCER


def acao_concluida_no_prazo(status: StatusAcao, prazo: date, concluida_em: datetime | None) -> bool:
    return status == StatusAcao.CONCLUIDA and concluida_em is not None and data_local(concluida_em) <= prazo


class SituacaoPrazo(str, enum.Enum):
    """Situação da ação para o colaborador (Minhas Ações e calendário). Mutuamente exclusivas.
    É a tag de prazo das abertas + "concluída"; os valores antigos foram mantidos para a API:
    atrasada = Em atraso, vencendo = A vencer, em_andamento = No prazo."""

    ATRASADA = "atrasada"  # aberta, prazo vencido (Em atraso)
    VENCENDO = "vencendo"  # aberta, prazo entre hoje e hoje + DIAS_A_VENCER (A vencer)
    EM_ANDAMENTO = "em_andamento"  # demais abertas (No prazo)
    CONCLUIDA = "concluida"


def situacao_prazo(status: StatusAcao, prazo: date, hoje: date) -> SituacaoPrazo | None:
    """None para recusadas/canceladas."""
    if status == StatusAcao.CONCLUIDA:
        return SituacaoPrazo.CONCLUIDA
    if status not in STATUS_ACAO_ABERTOS:
        return None
    if prazo < hoje:
        return SituacaoPrazo.ATRASADA
    if prazo <= hoje + timedelta(days=DIAS_A_VENCER):
        return SituacaoPrazo.VENCENDO
    return SituacaoPrazo.EM_ANDAMENTO


def situacao_prazo_sql(status_col, prazo_col, hoje: date):
    """A mesma regra de `situacao_prazo`, como CASE SQL (para filtrar/paginar no banco)."""
    from sqlalchemy import case

    abertos = [s.value for s in STATUS_ACAO_ABERTOS]
    return case(
        (status_col == StatusAcao.CONCLUIDA.value, SituacaoPrazo.CONCLUIDA.value),
        (status_col.not_in(abertos), None),
        (prazo_col < hoje, SituacaoPrazo.ATRASADA.value),
        (prazo_col <= hoje + timedelta(days=DIAS_A_VENCER), SituacaoPrazo.VENCENDO.value),
        else_=SituacaoPrazo.EM_ANDAMENTO.value,
    )


def tag_prazo_plano_sql(status_col, fim_col, hoje: date):
    """`tag_prazo_plano` como CASE SQL (filtros da listagem)."""
    from sqlalchemy import case

    return case(
        (status_col == StatusPlano.CONCLUIDO.value, None),
        (fim_col.is_(None), TagPrazo.SEM_PRAZO.value),
        (fim_col < hoje, TagPrazo.EM_ATRASO.value),
        (fim_col <= hoje + timedelta(days=DIAS_A_VENCER), TagPrazo.A_VENCER.value),
        else_=TagPrazo.NO_PRAZO.value,
    )


def plano_atrasado(status: StatusPlano, data_fim_estimado: date, hoje: date) -> bool:
    """Tag "Em atraso" do plano: derivada, nunca gravada. Não concluído com o fim estimado vencido."""
    return status in STATUS_PLANO_EM_EXECUCAO and data_fim_estimado < hoje


def plano_atrasado_para_iniciar(status: StatusPlano, data_inicio_estimado: date, hoje: date) -> bool:
    """Mesma ideia aplicada ao início: ainda não iniciado e o início estimado já passou."""
    return status == StatusPlano.NAO_INICIADO and data_inicio_estimado < hoje
