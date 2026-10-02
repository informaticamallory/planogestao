from datetime import date, datetime

from pydantic import BaseModel, Field

from app.models.enums import EventoHistorico, Prioridade, StatusAcao, StatusPlano
from app.services.periodo import Granularidade, TipoPeriodo
from app.services.regras import CategoriaAcao, TagPrazo


class PeriodoAplicado(BaseModel):
    tipo: TipoPeriodo
    inicio: date
    fim: date


class PrazoDoGrupo(BaseModel):
    """Situação do prazo dos registros não concluídos de um grupo (cada registro uma vez)."""

    grupo: str = Field(description="planos | acoes | subitens")
    em_atraso: int
    a_vencer: int
    no_prazo: int


class StatusDoGrupo(BaseModel):
    """Status de execução dos registros de um grupo (cada registro uma vez)."""

    grupo: str = Field(description="planos | acoes | subitens")
    nao_iniciado: int
    em_andamento: int
    concluido: int


class ResumoDashboard(BaseModel):
    periodo: PeriodoAplicado
    total_planos: int = Field(description="Planos criados no período (todos os status, exceto arquivados).")
    planos_nao_iniciados: int = Field(description="Status Não iniciado (nenhuma ação iniciada ainda).")
    planos_ativos: int = Field(description="Status Em andamento.")
    planos_atrasados: int = Field(description="Tag Em atraso: não concluídos com o fim estimado vencido (qualquer status).")
    planos_concluidos: int
    acoes_pendentes: int = Field(description="Status Não iniciado (aguardando aceite ou aceitas).")
    acoes_em_andamento: int = Field(description="Status Em andamento (inclui bloqueadas).")
    acoes_concluidas: int
    acoes_atrasadas: int = Field(
        description="Tag Em atraso: não concluídas com o prazo vencido. Contada à parte do status "
        "(estas ações também estão em Não iniciado ou Em andamento)."
    )
    percentual_cumprimento: float | None = Field(
        description="% de ações concluídas até o prazo, entre as já vencidas ou concluídas. "
        "Null quando não há base de cálculo."
    )
    total_acoes: int = Field(description="Ações principais criadas no período (sem recusadas/canceladas).")
    total_subitens: int = Field(description="Sub-itens de todos os níveis criados no período (sem recusados/cancelados).")
    subitens_nao_iniciados: int
    subitens_em_andamento: int
    subitens_concluidos: int
    progresso_geral: float | None = Field(description="Média do progresso dos PAs criados no período. Null sem PAs.")
    status_execucao: list[StatusDoGrupo] = Field(description="Não iniciado / Em andamento / Concluído dos PAs, ações e sub-itens.")
    situacao_prazo: list[PrazoDoGrupo] = Field(
        description="Tags de prazo dos PAs, ações e sub-itens não concluídos do período, contadas à parte do status."
    )


class PontoEvolucao(BaseModel):
    inicio: date
    fim: date
    criados: int
    concluidos: int
    atrasados: int = Field(description="Planos cujo fim estimado venceu no intervalo sem conclusão até o prazo.")


class EvolucaoPlanos(BaseModel):
    periodo: PeriodoAplicado
    granularidade: Granularidade
    pontos: list[PontoEvolucao]


class FatiaStatusAcoes(BaseModel):
    categoria: CategoriaAcao
    total: int


class StatusAcoes(BaseModel):
    periodo: PeriodoAplicado
    total: int
    fatias: list[FatiaStatusAcoes]


class ReferenciaPlano(BaseModel):
    id: int
    codigo: str
    nome: str


class ReferenciaUsuario(BaseModel):
    id: int
    nome: str


class PlanoRecente(BaseModel):
    id: int
    codigo: str
    nome: str
    status: StatusPlano
    prazo_tag: TagPrazo | None = Field(description="Situação do prazo; null para concluído.")
    data_fim_estimado: date
    responsavel: ReferenciaUsuario
    total_acoes: int
    acoes_concluidas: int
    progresso: int = Field(description="Média do progresso das ações (0-100), sem recusadas/canceladas.")
    criado_em: datetime


class AtividadeRecente(BaseModel):
    id: int
    evento: EventoHistorico
    campo_alterado: str | None
    valor_anterior: str | None
    valor_novo: str | None
    detalhe: str | None = Field(description="Motivo/descrição do evento (ex.: \"Sub-item de Ação 1 — …\").")
    criado_em: datetime
    usuario: ReferenciaUsuario
    acao_id: int
    acao_descricao: str
    plano: ReferenciaPlano


class MinhaAcao(BaseModel):
    id: int
    descricao: str
    status: StatusAcao
    categoria: CategoriaAcao = Field(description="Status de execução (Não iniciado / Em andamento).")
    prazo_tag: TagPrazo | None = Field(description="Situação do prazo, separada do status.")
    vencendo: bool
    prioridade: Prioridade
    prazo: date
    progresso: int
    plano: ReferenciaPlano


class DiaCalendario(BaseModel):
    data: date
    atrasadas: int
    vencendo: int
    em_andamento: int = Field(description="Abertas, sem atraso e fora da janela de vencimento.")
    concluidas: int


class CalendarioMes(BaseModel):
    ano: int
    mes: int
    dias: list[DiaCalendario] = Field(description="Apenas dias com ao menos uma ação com prazo.")
