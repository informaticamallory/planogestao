from datetime import date, datetime

from pydantic import BaseModel, Field, field_validator, model_validator
from pydantic_core import PydanticCustomError

from app.models.enums import EventoHistorico, Prioridade, StatusAcao, StatusPlano, StatusSolicitacao
from app.schemas.comum import Opcao
from app.services.regras import CategoriaAcao, TagPrazo


class RefAcao(BaseModel):
    """Referência curta a uma ação (pré-requisito, ação de origem, subação)."""

    id: int
    numero: str = Field(description='"2" (ação principal) ou "2.1" (subação).')
    descricao: str
    status: StatusAcao


class PlanoDaAcao(BaseModel):
    id: int
    codigo: str
    nome: str
    status: StatusPlano
    data_fim_estimado: date
    arquivado: bool = Field(default=False, description="Plano arquivado: a ação fica somente leitura e sem situação de prazo.")


class SubacaoItem(RefAcao):
    responsavel: Opcao
    area: Opcao
    setor: Opcao | None
    prazo_inicio: date | None
    prazo: date
    categoria: CategoriaAcao | None
    prazo_tag: TagPrazo | None
    progresso: int
    subacoes_diretas: int
    total_descendentes: int = Field(description="Subações abaixo, em todos os níveis (cada uma contada uma vez).")


class ItemCaminho(RefAcao):
    acessivel: bool = Field(description="O usuário pode abrir este item.")


class SolicitacaoResumo(BaseModel):
    id: int
    prazo_anterior: date
    novo_prazo_sugerido: date
    motivo: str
    status: StatusSolicitacao
    feita_antes_do_aceite: bool
    solicitado_por: Opcao
    respondido_por: Opcao | None
    resposta_justificativa: str | None
    respondido_em: datetime | None
    criado_em: datetime


class PermissoesAcao(BaseModel):
    """O que o usuário logado pode fazer nesta ação (o backend revalida em cada endpoint)."""

    eh_responsavel: bool
    eh_gestor: bool = Field(description="Responsável/criador do plano ou quem aprova prazos.")
    aceitar: bool
    solicitar_alteracao: bool
    responder_solicitacao: bool
    editar_execucao: bool = Field(description="Status/progresso/observação.")
    editar_prazo: bool
    editar_planejamento: bool = Field(
        description="Área, setor, prazo inicial estimado e (ações principais) pré-requisitos. Só gestores."
    )
    adicionar_subacao: bool
    reabrir: bool = Field(description="Gestor: voltar uma ação concluída para em andamento (com justificativa).")
    transicoes: list[StatusAcao] = Field(description="Status para os quais o usuário pode mudar a ação agora.")
    arquivar: bool = Field(default=False, description="acoes:arquivar + gestor do item, com o plano ativo.")
    desarquivar: bool = False
    excluir: bool = Field(default=False, description="acoes:excluir + gestor do item, com o plano ativo.")


class AcaoDetalhe(BaseModel):
    id: int
    numero: str = Field(description='"2" (ação principal), "2.1", "2.1.3"… (subações). Só visual.')
    nivel: int = Field(description="0 = ação principal; 1 = subação direta; 2 = subação da subação…")
    descricao: str
    plano: PlanoDaAcao
    plano_visivel: bool = Field(description="O usuário pode abrir o plano (o responsável por uma subação pode não poder).")
    caminho: list[ItemCaminho] = Field(description="Da ação principal até o pai imediato (PA → Ação 1 → Subação 1.1 → …).")
    acao_origem: RefAcao | None = Field(description="Subação: o pai imediato.")
    acao_origem_acessivel: bool
    responsavel: Opcao
    criado_por: Opcao | None
    area: Opcao
    setor: Opcao | None
    prazo_inicio: date | None = Field(description="Prazo inicial estimado (null em ações antigas).")
    prazo: date
    prioridade: Prioridade
    status: StatusAcao
    categoria: CategoriaAcao | None
    vencendo: bool
    dias_para_prazo: int
    progresso: int
    observacao: str | None
    motivo_bloqueio: str | None
    motivo_recusa: str | None
    motivo_cancelamento: str | None
    aceita_em: datetime | None
    iniciada_em: datetime | None = Field(description="Início real (1ª vez em andamento).")
    concluida_em: datetime | None
    criado_em: datetime
    atualizado_em: datetime
    depende_de: list[RefAcao] = Field(description="Pré-requisitos (ação principal).")
    aguardando: list[RefAcao] = Field(
        description="Pré-requisitos ainda não concluídos; para subações, os da ação principal. Vazio = pode iniciar."
    )
    revisar_prerequisito: bool = Field(
        description="Já iniciada, mas um pré-requisito voltou a ficar em aberto (ex.: reaberto): revisar."
    )
    prazo_tag: TagPrazo | None = Field(description="Tag do prazo de conclusão; null para concluída/descartada/arquivada.")
    arquivada: bool = Field(default=False, description="Arquivada individualmente (ou junto com o item acima).")
    arquivada_em: datetime | None = None
    subacoes: list[SubacaoItem]
    subacoes_pendentes: int = Field(description="Subações diretas em aberto (impedem a conclusão desta ação).")
    total_descendentes: int = Field(description="Subações abaixo, em todos os níveis.")
    solicitacao_pendente: SolicitacaoResumo | None
    solicitacoes: list[SolicitacaoResumo] = Field(description="Todas, da mais recente à mais antiga.")
    permissoes: PermissoesAcao


class AcaoAtualizar(BaseModel):
    """Atualização parcial: só os campos enviados são considerados."""

    status: StatusAcao | None = None
    progresso: int | None = Field(default=None, ge=0, le=100)
    prazo: date | None = Field(default=None, description="Só gestores. O responsável deve solicitar alteração.")
    observacao: str | None = Field(default=None, max_length=2000)
    motivo_bloqueio: str | None = Field(default=None, max_length=500, description="Obrigatório ao bloquear.")
    justificativa: str | None = Field(
        default=None, max_length=500, description="Motivo do cancelamento (obrigatório para subações)."
    )
    # Planejamento (só gestores).
    descricao: str | None = Field(default=None, min_length=3, max_length=2000, description="O que será feito.")
    prioridade: Prioridade | None = None
    prazo_inicio: date | None = None
    area_id: int | None = None
    setor_id: int | None = Field(default=None, description="Enviar null (com a chave) remove o setor.")
    depende_de: list[int] | None = Field(
        default=None, max_length=50, description="Substitui os pré-requisitos (ids de ações principais do plano)."
    )
    responsavel_id: int | None = Field(
        default=None, description="Troca o responsável (só gestores; conta ativa com acesso à área do plano)."
    )
    motivo_alteracao_prazo: str | None = Field(
        default=None, max_length=500, description="Opcional: motivo da mudança de prazo (histórico e aviso aos envolvidos)."
    )

    @field_validator("descricao", "observacao", "motivo_bloqueio", "justificativa", "motivo_alteracao_prazo", mode="before")
    @classmethod
    def _aparar(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v


class ReabrirAcao(BaseModel):
    justificativa: str = Field(min_length=5, max_length=500)

    @field_validator("justificativa", mode="before")
    @classmethod
    def _aparar(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v


class AcaoAtualizada(BaseModel):
    acao: AcaoDetalhe
    avisos: list[str]


class SolicitarAlteracao(BaseModel):
    novo_prazo_sugerido: date
    motivo: str = Field(min_length=5, max_length=1000)

    @field_validator("motivo", mode="before")
    @classmethod
    def _aparar(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v


class ResponderSolicitacao(BaseModel):
    aprovado: bool
    justificativa: str | None = Field(default=None, max_length=1000)


class AcaoHistoricoItem(BaseModel):
    id: int
    evento: EventoHistorico
    campo_alterado: str | None
    valor_anterior: str | None
    valor_novo: str | None
    detalhe: str | None
    usuario: Opcao
    criado_em: datetime
