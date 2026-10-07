import enum
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator, model_validator
from pydantic_core import PydanticCustomError

from app.models.enums import Prioridade, StatusAcao, StatusPlano
from app.schemas.acao import RefAcao
from app.schemas.comum import Opcao
from app.services.regras import CategoriaAcao, TagPrazo


class StatusFiltroPlano(str, enum.Enum):
    """Os 3 status globais. A situação do prazo é outro filtro (`prazo`)."""

    NAO_INICIADO = "nao_iniciado"
    EM_ANDAMENTO = "em_andamento"
    CONCLUIDO = "concluido"


class FiltroArquivados(str, enum.Enum):
    EXCLUIR = "excluir"
    INCLUIR = "incluir"
    SOMENTE = "somente"


class OrdenacaoPlano(str, enum.Enum):
    CODIGO = "codigo"
    NOME = "nome"
    RESPONSAVEL = "responsavel"
    AREA = "area"
    PRIORIDADE = "prioridade"
    INICIO = "data_inicio_estimado"
    PRAZO = "data_fim_estimado"
    PROGRESSO = "progresso"
    STATUS = "status"
    CRIADO_EM = "criado_em"


class FormatoExportacao(str, enum.Enum):
    CSV = "csv"
    XLSX = "xlsx"
    PDF = "pdf"


class PlanoListaItem(BaseModel):
    id: int
    codigo: str
    nome: str
    status: StatusPlano
    prazo_tag: TagPrazo | None = Field(description="Situação do prazo (fim estimado); null para concluído.")
    atrasado_para_iniciar: bool = Field(description="Não iniciado com o início estimado já vencido.")
    rascunho: bool
    prioridade: Prioridade
    data_inicio_estimado: date
    data_fim_estimado: date
    responsavel: Opcao
    area: Opcao
    setor: Opcao | None
    tipo: Opcao
    origem: Opcao
    progresso: int = Field(description="Média do progresso das ações (0-100), sem recusadas/canceladas.")
    total_acoes: int
    acoes_concluidas: int
    criado_em: datetime
    concluido_em: datetime | None
    arquivado: bool


class ContagemAcoes(BaseModel):
    categoria: CategoriaAcao
    total: int


class PlanoResumo(BaseModel):
    """Cabeçalho e indicadores de um plano (topo da tela de detalhe)."""

    id: int
    codigo: str
    nome: str
    status: StatusPlano
    prazo_tag: TagPrazo | None = Field(description="Situação do prazo (fim estimado); null para concluído.")
    atrasado_para_iniciar: bool = Field(description="Não iniciado com o início estimado já vencido.")
    rascunho: bool
    prioridade: Prioridade
    data_inicio_estimado: date
    data_fim_estimado: date
    dias_para_prazo: int = Field(description="Negativo quando o prazo já passou.")
    responsavel: Opcao
    criado_por: Opcao
    area: Opcao
    setor: Opcao | None
    tipo: Opcao
    origem: Opcao
    criado_em: datetime
    concluido_em: datetime | None
    arquivado_em: datetime | None
    arquivado_por: Opcao | None = Field(description="Quem arquivou (o histórico guarda todos os eventos).")
    progresso: int
    total_acoes: int
    acoes_por_categoria: list[ContagemAcoes]


class SetorOpcao(Opcao):
    area_id: int


# ---- criação -------------------------------------------------------------------

# Recusada/cancelada não fazem sentido na criação.
StatusInicialAcao = Literal["aguardando_aceite", "aceita", "em_andamento", "bloqueada", "concluida"]

TextoLongo = Annotated[str | None, Field(default=None, max_length=10_000)]


def _texto_ou_none(valor: str | None) -> str | None:
    if valor is None:
        return None
    valor = valor.strip()
    return valor or None


class AcaoCriar(BaseModel):
    descricao: str = Field(min_length=3, max_length=2000, description="O que será feito.")
    responsavel_id: int
    area_id: int
    setor_id: int | None = None
    prazo_inicio: date = Field(description="Prazo inicial estimado (previsão de início).")
    prazo: date = Field(description="Prazo de conclusão (estimado).")
    prioridade: Prioridade
    status: StatusInicialAcao = "aguardando_aceite"
    progresso: int = Field(default=0, ge=0, le=100)
    observacao: str | None = Field(default=None, max_length=2000)
    depende_de: list[int] = Field(
        default_factory=list, max_length=50, description="Ids de ações principais já cadastradas no mesmo plano."
    )
    depende_de_novas: list[int] = Field(
        default_factory=list,
        max_length=50,
        description="Posições (0-based) de outras ações deste mesmo envio das quais esta depende.",
    )

    @field_validator("descricao", "observacao", mode="before")
    @classmethod
    def _aparar(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v

    @model_validator(mode="after")
    def _coerencia_status_progresso(self) -> "AcaoCriar":
        if self.prazo_inicio > self.prazo:
            raise PydanticCustomError(
                "inicio_apos_conclusao", "O prazo inicial estimado não pode ser posterior ao prazo de conclusão."
            )
        if self.status == "concluida":
            self.progresso = 100
        elif self.status in ("aguardando_aceite", "aceita") and self.progresso > 0:
            raise PydanticCustomError(
                "progresso_sem_inicio", "Ação ainda não iniciada (aguardando aceite/aceita) não pode ter progresso."
            )
        self.observacao = _texto_ou_none(self.observacao)
        return self


class PlanoDadosBase(BaseModel):
    """Campos das etapas 1 (Identificação) e 2 (Problema/Oportunidade), comuns a criação e edição."""

    # Etapa 1 — Identificação
    nome: str = Field(min_length=3, max_length=200)
    tipo_id: int
    origem_id: int
    # Área/setor agora são escolhidos por ação. Sem valor, a área do plano vem da 1ª ação (ou do
    # responsável) na criação e é mantida na edição; ela continua valendo para visibilidade e indicadores.
    area_id: int | None = None
    setor_id: int | None = None
    responsavel_id: int
    data_inicio_estimado: date = Field(description="Quando o plano deve começar.")
    data_fim_estimado: date = Field(description="Quando o plano deve terminar (prazo do plano).")
    prioridade: Prioridade

    # Etapa 2 — Problema/Oportunidade
    descricao: TextoLongo
    descricao_problema: TextoLongo
    objetivo: TextoLongo
    causa: TextoLongo
    evidencias: TextoLongo
    observacoes: TextoLongo

    @field_validator("descricao", "descricao_problema", "objetivo", "causa", "evidencias", "observacoes", mode="before")
    @classmethod
    def _texto_vazio_vira_nulo(cls, v: object) -> object:
        return _texto_ou_none(v) if isinstance(v, str) else v

    @field_validator("nome", mode="before")
    @classmethod
    def _aparar_nome(cls, v: object) -> object:
        return v.strip() if isinstance(v, str) else v

    @model_validator(mode="after")
    def _regras_de_datas(self) -> "PlanoDadosBase":
        if self.data_fim_estimado < self.data_inicio_estimado:
            raise PydanticCustomError(
                "fim_antes_do_inicio", "A data fim estimada não pode ser anterior à data de início estimada."
            )
        return self

    def exigir_etapa2(self, acao: str) -> None:
        faltando = [
            rotulo
            for campo, rotulo in (("descricao_problema", "problema identificado"), ("objetivo", "objetivo"))
            if not getattr(self, campo)
        ]
        if faltando:
            raise PydanticCustomError(
                "etapa2_incompleta", "Para {acao} o plano, preencha: {campos}.", {"acao": acao, "campos": ", ".join(faltando)}
            )


class PlanoCriar(PlanoDadosBase):
    """Etapa 1 é sempre obrigatória. Etapas 2 e 3 são exigidas só quando o plano não é rascunho.
    O status não é enviado: é calculado pelas ações."""

    rascunho: bool = Field(default=False, description="Rascunho: etapas 2 e 3 opcionais e ninguém é avisado.")
    # Etapa 3 — Ações (gravadas na mesma transação do plano)
    acoes: list[AcaoCriar] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def _regras_por_etapa(self) -> "PlanoCriar":
        if not self.rascunho:
            self.exigir_etapa2("iniciar")
            if not self.acoes:
                raise PydanticCustomError("sem_acoes", "Para liberar o plano, cadastre pelo menos uma ação.")
        return self


class PlanoAtualizar(PlanoDadosBase):
    """Edição completa (PUT). O status não é editável (calculado pelas ações).
    `rascunho=false` num rascunho libera o plano (exige etapa 2 e ao menos uma ação)."""

    rascunho: bool = False
    motivo_alteracao_prazo: str | None = Field(
        default=None, max_length=200, description="Opcional: motivo da mudança das datas estimadas (histórico e aviso)."
    )

    @model_validator(mode="after")
    def _etapa2_para_plano_liberado(self) -> "PlanoAtualizar":
        if not self.rascunho:
            self.exigir_etapa2("liberar")
        return self


class AcaoResumo(BaseModel):
    id: int
    numero: str = Field(description='"2" (ação principal) ou "2.1" (subação).')
    descricao: str
    responsavel: Opcao
    area: Opcao
    setor: Opcao | None
    prazo_inicio: date | None = Field(description="Prazo inicial estimado (null em ações antigas).")
    prazo: date
    prioridade: Prioridade
    status: StatusAcao
    categoria: CategoriaAcao | None
    prazo_tag: TagPrazo | None = Field(description="Situação do prazo de conclusão; null para concluída/descartada.")
    progresso: int
    observacao: str | None


class PlanoCriado(BaseModel):
    plano: "PlanoResumo"
    acoes: list[AcaoResumo]
    avisos: list[str] = Field(description="Alertas não bloqueantes (ex.: prazo de ação após o fim estimado).")


class AcoesAdicionadas(BaseModel):
    acoes: list[AcaoResumo]
    avisos: list[str]


class AnexoResumo(BaseModel):
    id: int
    nome_arquivo: str
    mime_type: str
    tamanho_bytes: int
    enviado_por: Opcao
    criado_em: datetime


# ---- detalhe -------------------------------------------------------------------------


class PermissoesPlano(BaseModel):
    """O que o usuário logado pode fazer neste plano (o backend revalida em cada endpoint)."""

    editar: bool
    arquivar: bool
    adicionar_acoes: bool
    enviar_anexos: bool
    excluir: bool = Field(default=False, description="planos:excluir + poder editar o plano.")
    concluir: bool = Field(default=False, description="Confirmar a conclusão de um plano apto (objetivo atingido).")
    gerenciar_equipes: bool = Field(default=False, description="Criar e alterar as equipes deste plano.")


class PlanoDetalhe(PlanoResumo):
    descricao: str | None
    descricao_problema: str | None
    objetivo: str | None
    causa: str | None
    evidencias: str | None
    observacoes: str | None
    atualizado_em: datetime
    permissoes: PermissoesPlano
    apto_conclusao: bool = Field(
        default=False, description="Ações válidas todas concluídas, mas o plano espera a confirmação (houve arquivamento/exclusão)."
    )


class PlanoAtualizado(BaseModel):
    plano: PlanoDetalhe
    avisos: list[str]


class IndicadoresPlano(BaseModel):
    total_acoes: int = Field(description="Sem recusadas/canceladas.")
    # Status de execução (somam total_acoes).
    pendentes: int = Field(description="Não iniciado (aguardando aceite ou aceitas).")
    em_andamento: int = Field(description="Em andamento (inclui bloqueadas).")
    concluidas: int
    # Situação do prazo das não concluídas, contada à parte do status.
    atrasadas: int = Field(description="Tag Em atraso.")
    a_vencer: int = Field(description="Tag A vencer (hoje até +3 dias).")
    no_prazo: int = Field(description="Tag No prazo.")
    descartadas: int = Field(description="Recusadas + canceladas.")
    progresso: int
    concluidas_no_prazo: int
    concluidas_com_atraso: int
    abertas_no_prazo: int = Field(description="A vencer + No prazo.")
    percentual_cumprimento: float | None = Field(
        description="Concluídas até o prazo / (concluídas + atrasadas). Null sem base de cálculo."
    )


class AcaoDoPlano(AcaoResumo):
    acao_pai_id: int | None = Field(description="Subação: id do pai imediato (vínculo estável; o número é só visual).")
    nivel: int = Field(description="0 = ação principal; 1, 2, 3… = profundidade da subação.")
    subacoes_diretas: int
    total_descendentes: int = Field(description="Subações abaixo, em todos os níveis.")
    revisar_prerequisito: bool = Field(description="Já iniciada, mas um pré-requisito voltou a ficar em aberto.")
    vencendo: bool
    aceita_em: datetime | None
    iniciada_em: datetime | None = Field(description="Início real (1ª vez em andamento).")
    concluida_em: datetime | None
    criado_em: datetime
    depende_de: list[RefAcao]
    aguardando: list[RefAcao] = Field(
        description="Pré-requisitos ainda não concluídos (para subações, os da ação principal)."
    )
    arquivada: bool = Field(default=False, description="Arquivada individualmente: fora das listas e do cálculo do plano.")
    operacoes: "OperacoesAcao"


class OperacoesAcao(BaseModel):
    """Botões da linha/cartão da ação (o backend revalida em cada endpoint)."""

    editar: bool
    arquivar: bool
    desarquivar: bool
    excluir: bool


AcaoDoPlano.model_rebuild()


class EventoTimeline(BaseModel):
    id: str = Field(description='Único na timeline: "p-<id>" (plano), "a-<id>" (ação) ou "x-<id>" (anexo).')
    origem: Literal["plano", "acao", "anexo"]
    evento: str = Field(description="plano: criacao|alteracao|arquivamento|desarquivamento; acao: criacao|alteracao|comentario; anexo: envio")
    campo_alterado: str | None
    valor_anterior: str | None
    valor_novo: str | None
    usuario: Opcao | None = Field(description="Autor. Null = alteração automática do sistema.")
    motivo: str | None = Field(default=None, description="Motivo de uma alteração automática.")
    acao: Opcao | None = Field(description="Ação envolvida (nome = descrição).")
    anexo_nome: str | None
    criado_em: datetime


class OpcoesPlanos(BaseModel):
    """Listas para os filtros e formulários de planos."""

    responsaveis: list[Opcao]
    areas: list[Opcao]
    setores: list[SetorOpcao]
    tipos: list[Opcao]
    origens: list[Opcao]
