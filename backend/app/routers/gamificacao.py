from collections.abc import Callable
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, require_permission
from app.core.tempo import como_utc
from app.models import Usuario
from app.models.enums import ReferenciaNotificacao
from app.models.gamificacao import CategoriaPontuacao, GamificacaoPeriodo, SituacaoPeriodo
from app.routers.relatorios import _arquivo
from app.services.exportacao import Aba, Coluna, gerar_arquivo
from app.services.gamificacao_apuracao import ApuracaoService, linha_relatorio
from app.services.gamificacao_service import FiltrosGamificacao, GamificacaoService, PeriodoNaoEncontrado

router = APIRouter(prefix="/gamificacao", tags=["gamificacao"])

# O ranking é da fábrica toda: não segue a visibilidade de planos.
UsuarioGamificacao = Annotated[Usuario, Depends(require_permission("gamificacao:ver"))]
UsuarioAuditoria = Annotated[Usuario, Depends(require_permission("gamificacao:auditoria"))]
UsuarioExportar = Annotated[Usuario, Depends(require_permission("gamificacao:auditoria", "gamificacao:exportar"))]
UsuarioPeriodos = Annotated[Usuario, Depends(require_permission("gamificacao:periodos"))]
UsuarioEncerrar = Annotated[Usuario, Depends(require_permission("gamificacao:encerrar"))]
UsuarioReabrir = Annotated[Usuario, Depends(require_permission("gamificacao:reabrir"))]


def alguma_permissao(*codigos: str) -> Callable[..., Usuario]:
    def dependency(usuario: Usuario = Depends(get_current_user)) -> Usuario:
        if not set(codigos) & usuario.codigos_permissao:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Acesso negado para o seu perfil.")
        return usuario

    return dependency


UsuarioApuracao = Annotated[Usuario, Depends(alguma_permissao("gamificacao:periodos", "gamificacao:encerrar", "gamificacao:auditoria"))]


def filtros_query(
    periodo_id: int | None = Query(default=None, description="Período de apuração. Sem ele: o que contém hoje."),
    area_id: int | None = Query(default=None, description="Área do colaborador."),
    setor_id: int | None = Query(default=None, description="Setor do colaborador."),
    equipe_id: int | None = Query(default=None, description="Equipe cadastrada: só os membros dela."),
) -> FiltrosGamificacao:
    return FiltrosGamificacao(periodo_id=periodo_id, area_id=area_id, setor_id=setor_id, equipe_id=equipe_id)


FiltrosDep = Annotated[FiltrosGamificacao, Depends(filtros_query)]


def _sem_periodo() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, "Nenhum período de apuração cadastrado.")


# ---- schemas -----------------------------------------------------------------------------

Categoria = Literal["gestor", "executor"]
Classificacao = Literal["plano_concluido", "acao_no_prazo", "acao_fora_do_prazo"]


class ResumoGamificacao(BaseModel):
    periodo_id: int
    periodo_nome: str
    periodo_inicio: date
    periodo_fim: date
    situacao: Literal["planejado", "aberto", "encerrado"]
    encerrado_em: datetime | None
    gestores: int
    executores: int
    colaboradores: int
    planos_ativos: int
    planos_concluidos: int
    acoes_concluidas: int
    acoes_no_prazo: int
    acoes_fora_prazo: int
    percentual_no_prazo: float | None
    pontos_distribuidos: int
    pontos_gestores: int
    pontos_executores: int


class PremioSaida(BaseModel):
    categoria: Categoria
    colocacao: int
    nome: str
    descricao: str | None
    valor: Decimal | None


class ColaboradorRanking(BaseModel):
    posicao: int
    empatado: bool
    usuario_id: int
    nome: str
    avatar_url: str | None
    area: str | None
    setor: str | None
    pontos: int
    planos_concluidos: int
    acoes_no_prazo: int
    acoes_fora_prazo: int
    desempenho: float | None
    premio: PremioSaida | None
    premio_pendente: bool
    colocacoes_disputadas: list[int]
    pontos_periodo_anterior: int
    variacao: int
    tendencia: Literal["subiu", "caiu", "estavel", "novo"]


class PaginaRanking(BaseModel):
    items: list[ColaboradorRanking]
    total: int
    page: int
    page_size: int


class Podio(BaseModel):
    suficiente: bool
    minimo: int
    colaboradores_pontuando: int
    items: list[ColaboradorRanking]


class ItemPontuacao(BaseModel):
    lancamento_id: int
    usuario_id: int
    participante: str
    categoria: Categoria
    classificacao: Classificacao
    pontos: int
    regra: str
    plano_id: int
    plano_codigo: str | None
    plano_nome: str | None
    acao_id: int | None
    acao_codigo: str | None
    acao_descricao: str | None
    concluido_em: datetime
    prazo: date | None
    origem: str
    lancado_em: datetime


class ItensParticipante(BaseModel):
    periodo_id: int
    usuario_id: int
    nome: str | None
    total: int
    items: list[ItemPontuacao]


class RegraPontuacao(BaseModel):
    id: int
    gatilho: str
    nome: str
    descricao: str
    aplica_a: str
    pontos: int
    ativo: bool


class OpcaoDaArea(BaseModel):
    id: int
    nome: str
    area_id: int


class OpcaoArea(BaseModel):
    id: int
    nome: str


class OpcoesGamificacao(BaseModel):
    areas: list[OpcaoArea]
    setores: list[OpcaoDaArea]
    equipes: list[OpcaoDaArea]


class PeriodoSaida(BaseModel):
    id: int
    nome: str
    ano: int
    data_inicio: date
    data_fim: date
    situacao: Literal["planejado", "aberto", "encerrado"]
    encerrado_em: datetime | None
    premios: list[PremioSaida]


class ListaPeriodos(BaseModel):
    items: list[PeriodoSaida]
    padrao_id: int | None


class PeriodoEntrada(BaseModel):
    nome: str = Field(min_length=2, max_length=60)
    ano: int = Field(ge=2000, le=2100)
    data_inicio: date
    data_fim: date
    situacao: Literal["planejado", "aberto"] = "planejado"


class PremioEntrada(BaseModel):
    categoria: Categoria
    colocacao: int = Field(ge=1, le=100)
    nome: str = Field(min_length=1, max_length=100)
    descricao: str | None = Field(default=None, max_length=500)
    valor: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)


class PremiosEntrada(BaseModel):
    premios: list[PremioEntrada] = Field(max_length=200)


class GerarTrimestres(BaseModel):
    ano: int = Field(ge=2000, le=2100)


class ResultadoTrimestres(BaseModel):
    criados: list[str]
    existentes: list[str]
    conflitos: list[str]


class Justificativa(BaseModel):
    justificativa: str = Field(min_length=10, max_length=500)


class Regularizacao(BaseModel):
    referencia_tipo: Literal["plano", "acao"]
    referencia_id: int
    data_conclusao: date
    justificativa: str = Field(min_length=10, max_length=500)


class BloqueioSaida(BaseModel):
    tipo: str
    mensagem: str


class VerificacaoSaida(BaseModel):
    pode_encerrar: bool
    bloqueios: list[BloqueioSaida]
    avisos: list[str]


class Inconsistencia(BaseModel):
    referencia_tipo: Literal["plano", "acao"]
    referencia_id: int
    plano_id: int
    plano_codigo: str
    rotulo: str
    responsavel: str
    prazo: date | None
    problema: str


class ResultadoRecalculo(BaseModel):
    criados: int
    revertidos: int


class ResultadoCorrecao(BaseModel):
    revertido_id: int
    novo_id: int | None


class ResultadoRegularizacao(BaseModel):
    lancamento_id: int | None


class TotalParticipante(BaseModel):
    usuario_id: int
    participante: str
    categoria: Categoria
    lancamentos: int
    pontos: int


class EventoSaida(BaseModel):
    id: int
    evento: str
    detalhe: str
    justificativa: str | None
    autor: str
    criado_em: datetime
    lancamento_id: int | None


class OpcoesRelatorio(BaseModel):
    participantes: list[tuple[int, str]]
    planos: list[tuple[int, str]]
    acoes: list[tuple[int, str]]


class RelatorioAuditoria(BaseModel):
    periodo_id: int
    periodo_nome: str
    situacao: str
    encerrado: bool
    items: list[ItemPontuacao]
    totais: list[TotalParticipante]
    total_pontos: int
    total_lancamentos: int
    total_periodo: int
    total_ranking: int
    opcoes: OpcoesRelatorio
    eventos: list[EventoSaida]


def _periodo_saida(p: GamificacaoPeriodo) -> PeriodoSaida:
    return PeriodoSaida(
        id=p.id, nome=p.nome, ano=p.ano, data_inicio=p.data_inicio, data_fim=p.data_fim, situacao=p.situacao.value,
        encerrado_em=como_utc(p.encerrado_em) if p.encerrado_em else None,
        premios=[PremioSaida(categoria=x.categoria.value, colocacao=x.colocacao, nome=x.nome, descricao=x.descricao, valor=x.valor)
                 for x in p.premios],
    )


def _utc(d: dict) -> dict:
    return {k: (como_utc(v) if isinstance(v, datetime) else v) for k, v in d.items()}


# ---- painel ---------------------------------------------------------------------------------


@router.get("/resumo", response_model=ResumoGamificacao)
def resumo(f: FiltrosDep, _: UsuarioGamificacao, db: Session = Depends(get_db)):
    try:
        return _utc(GamificacaoService(db).resumo(f))
    except PeriodoNaoEncontrado:
        raise _sem_periodo() from None


@router.get("/ranking", response_model=PaginaRanking)
def ranking(
    f: FiltrosDep,
    _: UsuarioGamificacao,
    categoria: CategoriaPontuacao = CategoriaPontuacao.EXECUTOR,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
    db: Session = Depends(get_db),
):
    """Ranking de uma categoria. Mesma pontuação = mesma colocação; prêmio disputado por empate fica pendente."""
    try:
        return GamificacaoService(db).ranking(f, categoria, page, page_size)
    except PeriodoNaoEncontrado:
        raise _sem_periodo() from None


@router.get("/podio", response_model=Podio)
def podio(f: FiltrosDep, _: UsuarioGamificacao, categoria: CategoriaPontuacao = CategoriaPontuacao.EXECUTOR,
          db: Session = Depends(get_db)):
    """Top 5 da categoria, só com dados suficientes (pelo menos `minimo` colaboradores com pontos)."""
    try:
        return GamificacaoService(db).podio(f, categoria)
    except PeriodoNaoEncontrado:
        raise _sem_periodo() from None


@router.get("/participantes/{usuario_id}", response_model=ItensParticipante)
def itens_do_participante(
    usuario_id: int, usuario: UsuarioGamificacao, periodo_id: int | None = None, categoria: CategoriaPontuacao | None = None,
    db: Session = Depends(get_db),
):
    """Itens que compõem a pontuação. Mostra planos e ações: só o próprio participante ou quem tem a auditoria."""
    if usuario.id != usuario_id and "gamificacao:auditoria" not in usuario.codigos_permissao:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "O detalhamento de outro participante exige a permissão de auditoria.")
    try:
        dados = GamificacaoService(db).itens_do_participante(periodo_id, usuario_id, categoria)
    except PeriodoNaoEncontrado:
        raise _sem_periodo() from None
    dados["items"] = [_item_saida(l) for l in dados["items"]]
    return dados


def _item_saida(l) -> dict:
    d = {k: getattr(l, k) for k in l.__dataclass_fields__}
    d["concluido_em"], d["lancado_em"] = como_utc(l.concluido_em), como_utc(l.lancado_em)
    return d


@router.get("/regras", response_model=list[RegraPontuacao])
def regras(_: UsuarioGamificacao, db: Session = Depends(get_db)):
    return GamificacaoService(db).regras()


@router.get("/opcoes", response_model=OpcoesGamificacao)
def opcoes(_: UsuarioGamificacao, db: Session = Depends(get_db)):
    return GamificacaoService(db).opcoes()


# ---- períodos e prêmios ----------------------------------------------------------------------


@router.get("/periodos", response_model=ListaPeriodos)
def listar_periodos(_: UsuarioGamificacao, db: Session = Depends(get_db)):
    servico = GamificacaoService(db)
    padrao = servico.periodo_padrao()
    return ListaPeriodos(items=[_periodo_saida(p) for p in servico.periodos()], padrao_id=padrao.id if padrao else None)


@router.post("/periodos", response_model=PeriodoSaida, status_code=status.HTTP_201_CREATED)
def criar_periodo(corpo: PeriodoEntrada, usuario: UsuarioPeriodos, db: Session = Depends(get_db)):
    p = ApuracaoService(db, usuario).criar_periodo(corpo.nome, corpo.ano, corpo.data_inicio, corpo.data_fim, SituacaoPeriodo(corpo.situacao))
    return _periodo_saida(p)


@router.put("/periodos/{periodo_id}", response_model=PeriodoSaida)
def atualizar_periodo(periodo_id: int, corpo: PeriodoEntrada, usuario: UsuarioPeriodos, db: Session = Depends(get_db)):
    p = ApuracaoService(db, usuario).atualizar_periodo(
        periodo_id, corpo.nome, corpo.ano, corpo.data_inicio, corpo.data_fim, SituacaoPeriodo(corpo.situacao)
    )
    return _periodo_saida(p)


@router.delete("/periodos/{periodo_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_periodo(periodo_id: int, usuario: UsuarioPeriodos, db: Session = Depends(get_db)) -> None:
    ApuracaoService(db, usuario).excluir_periodo(periodo_id)


@router.post("/periodos/gerar-trimestres", response_model=ResultadoTrimestres)
def gerar_trimestres(corpo: GerarTrimestres, usuario: UsuarioPeriodos, db: Session = Depends(get_db)):
    """Os 4 trimestres civis do ano, sem duplicar os que já existem."""
    return ApuracaoService(db, usuario).gerar_trimestres(corpo.ano)


@router.put("/periodos/{periodo_id}/premios", response_model=PeriodoSaida)
def definir_premios(periodo_id: int, corpo: PremiosEntrada, usuario: UsuarioPeriodos, db: Session = Depends(get_db)):
    """Substitui a lista de prêmios do período (uma colocação por categoria)."""
    p = ApuracaoService(db, usuario).definir_premios(periodo_id, [x.model_dump() for x in corpo.premios])
    return _periodo_saida(p)


@router.post("/periodos/{periodo_id}/recalcular", response_model=ResultadoRecalculo)
def recalcular(periodo_id: int, usuario: UsuarioPeriodos, db: Session = Depends(get_db)):
    """Concilia o extrato com as conclusões do período (cria o que falta, reverte o que deixou de valer)."""
    return ApuracaoService(db, usuario).recalcular(periodo_id)


@router.get("/periodos/{periodo_id}/verificacao", response_model=VerificacaoSaida)
def verificar(periodo_id: int, usuario: UsuarioApuracao, db: Session = Depends(get_db)):
    return ApuracaoService(db, usuario).verificar(periodo_id)


@router.post("/periodos/{periodo_id}/encerrar", response_model=PeriodoSaida)
def encerrar(periodo_id: int, usuario: UsuarioEncerrar, db: Session = Depends(get_db)):
    """Encerra e congela o resultado (fotografia). Recusado com empates em prêmios ou pendências."""
    return _periodo_saida(ApuracaoService(db, usuario).encerrar(periodo_id))


@router.post("/periodos/{periodo_id}/reabrir", response_model=PeriodoSaida)
def reabrir(periodo_id: int, corpo: Justificativa, usuario: UsuarioReabrir, db: Session = Depends(get_db)):
    return _periodo_saida(ApuracaoService(db, usuario).reabrir(periodo_id, corpo.justificativa))


# ---- regularização e correção ----------------------------------------------------------------


@router.get("/inconsistencias", response_model=list[Inconsistencia])
def inconsistencias(usuario: UsuarioApuracao, db: Session = Depends(get_db)):
    """Concluídos sem data de conclusão: não pontuam até a data efetiva ser informada."""
    return ApuracaoService(db, usuario).inconsistencias()


@router.post("/regularizacoes", response_model=ResultadoRegularizacao)
def regularizar(corpo: Regularizacao, usuario: UsuarioPeriodos, db: Session = Depends(get_db)):
    return ApuracaoService(db, usuario).regularizar(
        ReferenciaNotificacao(corpo.referencia_tipo), corpo.referencia_id, corpo.data_conclusao, corpo.justificativa
    )


@router.post("/lancamentos/{lancamento_id}/corrigir", response_model=ResultadoCorrecao)
def corrigir(lancamento_id: int, corpo: Justificativa, usuario: UsuarioPeriodos, db: Session = Depends(get_db)):
    """Recalcula um item pelos dados atuais (ex.: responsável ou prazo corrigidos): reverte e lança de novo."""
    return ApuracaoService(db, usuario).corrigir(lancamento_id, corpo.justificativa)


# ---- relatório de auditoria ----------------------------------------------------------------------


def _relatorio(db: Session, usuario: Usuario, periodo_id, categoria, usuario_id, plano_id, acao_id, classificacao) -> dict:
    try:
        return ApuracaoService(db, usuario).relatorio(periodo_id, categoria, usuario_id, plano_id, acao_id, classificacao)
    except PeriodoNaoEncontrado:
        raise _sem_periodo() from None


@router.get("/auditoria", response_model=RelatorioAuditoria)
def auditoria(
    usuario: UsuarioAuditoria,
    periodo_id: int | None = None,
    categoria: Categoria | None = None,
    usuario_id: int | None = Query(default=None, description="Participante."),
    plano_id: int | None = None,
    acao_id: int | None = None,
    classificacao: Classificacao | None = None,
    db: Session = Depends(get_db),
):
    dados = _relatorio(db, usuario, periodo_id, categoria, usuario_id, plano_id, acao_id, classificacao)
    dados["items"] = [_item_saida(l) for l in dados["items"]]
    dados["eventos"] = [_utc(e) for e in dados["eventos"]]
    return dados


ROTULO_EVENTO = {
    "reversao": "Reversão", "mantido": "Reabertura de item (pontuação mantida)", "recalculo": "Recálculo",
    "correcao": "Correção", "regularizacao": "Regularização", "encerramento": "Encerramento", "reabertura": "Reabertura",
    "periodo": "Período", "premios": "Prêmios",
}


@router.get("/auditoria/exportar", response_class=Response,
            responses={200: {"content": {"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {}}}})
def exportar_auditoria(
    usuario: UsuarioExportar,
    periodo_id: int | None = None,
    categoria: Categoria | None = None,
    usuario_id: int | None = None,
    plano_id: int | None = None,
    acao_id: int | None = None,
    classificacao: Classificacao | None = None,
    db: Session = Depends(get_db),
):
    """Excel com a pontuação (mesmas linhas da tela), os totais por participante e o histórico de ajustes."""
    dados = _relatorio(db, usuario, periodo_id, categoria, usuario_id, plano_id, acao_id, classificacao)
    linhas = [linha_relatorio(l) | {"concluido_em": como_utc(l.concluido_em)} for l in dados["items"]]
    colunas = [
        Coluna("Lançamento", lambda r: r["lancamento"], 12),
        Coluna("Participante", lambda r: r["participante"], 26),
        Coluna("Categoria", lambda r: r["categoria"], 11),
        Coluna("Plano", lambda r: r["plano_codigo"], 15),
        Coluna("Nome do plano", lambda r: r["plano_nome"], 32),
        Coluna("Ação", lambda r: r["acao_codigo"], 8),
        Coluna("Descrição da ação", lambda r: r["acao_descricao"], 40),
        Coluna("Conclusão efetiva", lambda r: r["concluido_em"], 18, "data_hora"),
        Coluna("Prazo considerado", lambda r: r["prazo"], 14, "data"),
        Coluna("Classificação", lambda r: r["classificacao"], 20),
        Coluna("Pontos", lambda r: r["pontos"], 9),
        Coluna("Regra aplicada", lambda r: r["regra"], 24),
        Coluna("Origem", lambda r: r["origem"], 13),
    ]
    totais = [
        Aba("Totais", [
            Coluna("Participante", lambda t: t["participante"], 28),
            Coluna("Categoria", lambda t: {"gestor": "Gestor", "executor": "Executor"}.get(t["categoria"], ""), 12),
            Coluna("Lançamentos", lambda t: t["lancamentos"], 12),
            Coluna("Pontos", lambda t: t["pontos"], 10),
        ], dados["totais"] + [dict(participante="TOTAL", categoria="", lancamentos=dados["total_lancamentos"], pontos=dados["total_pontos"])]),
        Aba("Histórico", [
            Coluna("Data", lambda e: como_utc(e["criado_em"]), 18, "data_hora"),
            Coluna("Evento", lambda e: ROTULO_EVENTO.get(e["evento"], e["evento"]), 22),
            Coluna("Autor", lambda e: e["autor"], 24),
            Coluna("Justificativa", lambda e: e["justificativa"], 40),
            Coluna("Detalhe", lambda e: e["detalhe"], 70),
        ], dados["eventos"]),
    ]
    filtros = [f"Período: {dados['periodo_nome']} ({dados['situacao']})",
               f"Total do relatório: {dados['total_pontos']} pts em {dados['total_lancamentos']} lançamento(s)",
               f"Total do período no ranking: {dados['total_ranking']} pts"]
    for rotulo, valor in (("Categoria", categoria), ("Participante", usuario_id), ("Plano", plano_id), ("Ação", acao_id),
                          ("Classificação", classificacao)):
        if valor is not None:
            filtros.append(f"{rotulo}: {valor}")
    return _arquivo(gerar_arquivo("xlsx", "Pontuação", "auditoria_gamificacao", filtros, colunas, linhas, totais))
