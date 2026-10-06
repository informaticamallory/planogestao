"""Painéis configuráveis (Dashboard e Indicadores): grid de widgets por usuário.

Cada widget é uma instância com o dado que representa (`tipo_dado`), como exibi-lo
(`tipo_visualizacao`), retângulo no grid de 12 colunas e visibilidade. O dado sempre vem dos
endpoints das Fases 2 e 9: o widget só decide COMO mostrá-lo.

Este módulo é a fonte da verdade do catálogo (dados disponíveis por tela, visualizações compatíveis,
tamanhos mínimos) e do layout padrão; o PUT só aceita configurações válidas contra ele.
"""

import enum
import re
from dataclasses import dataclass

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import PreferenciaLayout, Usuario
from app.services.erros import RegraInvalida

COLUNAS = 12
ALTURA_MAX = 24
Y_MAX = 1000
MAX_WIDGETS = 60
VERSAO_CONFIG = 2  # 1 = lista da Fase 26 (sem grid): tratada como "nunca personalizou"
# Versão do catálogo gravada junto do layout. Layouts salvos antes de uma versão recebem, ao final,
# os widgets que ela trouxe (NOVOS_NA_VERSAO), sem mexer no que o usuário montou.
VERSAO_CATALOGO = 4
_ID_WIDGET = re.compile(r"^[a-z0-9_-]{1,40}$")


class Tela(str, enum.Enum):
    DASHBOARD = "dashboard"
    INDICADORES = "indicadores"


class Visualizacao(str, enum.Enum):
    CARD_NUMERO = "card_numero"
    GAUGE = "gauge"
    GRAFICO_BARRA = "grafico_barra"
    GRAFICO_LINHA = "grafico_linha"
    GRAFICO_PIZZA = "grafico_pizza"
    GRAFICO_ROSCA = "grafico_rosca"
    TABELA = "tabela"
    LISTA = "lista"  # listas com links (planos recentes, minhas ações...)
    CALENDARIO = "calendario"


V = Visualizacao
# Compatibilidade por natureza do dado.
_NUMERO = (V.CARD_NUMERO,)  # contagem única: só faz sentido como número
_PERCENTUAL = (V.CARD_NUMERO, V.GAUGE)  # indicador único em %: número ou medidor
_SERIE_TEMPORAL = (V.GRAFICO_LINHA, V.GRAFICO_BARRA, V.TABELA)
_PARTES_DO_TODO = (V.GRAFICO_ROSCA, V.GRAFICO_PIZZA, V.GRAFICO_BARRA, V.TABELA)  # categorias que somam um total
_CATEGORIAS = (V.GRAFICO_BARRA, V.GRAFICO_ROSCA, V.GRAFICO_PIZZA, V.TABELA)
_EMPILHADO = (V.GRAFICO_BARRA, V.TABELA)  # grupos × séries: pizza/rosca perderiam uma dimensão


@dataclass(frozen=True)
class DefDado:
    tipo: str
    titulo: str
    visualizacoes: tuple[Visualizacao, ...]
    padrao: tuple[int, int]  # (largura_colunas, altura_linhas) ao adicionar
    minimo: tuple[int, int]


def _card(tipo: str, titulo: str, viz=_NUMERO) -> DefDado:
    return DefDado(tipo, titulo, viz, (2, 3), (2, 2))


def _grafico(tipo: str, titulo: str, viz, padrao=(4, 8), minimo=(3, 5)) -> DefDado:
    return DefDado(tipo, titulo, viz, padrao, minimo)


CATALOGO: dict[Tela, dict[str, DefDado]] = {
    Tela.DASHBOARD: {
        d.tipo: d
        for d in (
            _card("total_planos", "Total de Planos"),
            _card("total_acoes", "Total de Ações"),
            _card("total_subitens", "Total de Sub-itens"),
            _card("progresso_geral", "Progresso Geral", _PERCENTUAL),
            _card("planos_nao_iniciados", "Planos Não Iniciados"),
            _card("planos_ativos", "Planos em Andamento"),
            _card("planos_atrasados", "Planos Em Atraso"),
            _card("planos_concluidos", "Planos Concluídos"),
            _card("acoes_pendentes", "Ações Não Iniciadas"),
            _card("acoes_em_andamento", "Ações em Andamento"),
            _card("acoes_atrasadas", "Ações Em Atraso"),
            _card("acoes_concluidas", "Ações Concluídas"),
            _card("percentual_cumprimento", "% de Cumprimento", _PERCENTUAL),
            _grafico("evolucao_planos", "Evolução dos Planos", _SERIE_TEMPORAL, (6, 9)),
            _grafico("status_acoes", "Status das Ações", _PARTES_DO_TODO),
            _grafico("status_execucao", "Status de Execução", _EMPILHADO, (4, 9)),
            _grafico("situacao_prazo", "Situação do Prazo", _EMPILHADO, (4, 9)),
            _grafico("planos_recentes", "Planos Recentes", (V.LISTA,)),
            _grafico("atividades_recentes", "Atividades Recentes", (V.LISTA,)),
            _grafico("minhas_acoes", "Minhas Ações", (V.LISTA,)),
            _grafico("mini_calendario", "Mini calendário", (V.CALENDARIO,), (4, 9), (3, 8)),
        )
    },
    Tela.INDICADORES: {
        d.tipo: d
        for d in (
            _card("pct_planos_concluidos", "% planos concluídos", _PERCENTUAL),
            _card("pct_acoes_concluidas", "% ações concluídas", _PERCENTUAL),
            _card("pct_subitens_concluidos", "% sub-itens concluídos", _PERCENTUAL),
            _card("pct_acoes_no_prazo", "% ações no prazo", _PERCENTUAL),
            _card("pct_acoes_atrasadas", "% ações em atraso", _PERCENTUAL),
            _card("tempo_medio_planos", "Tempo médio — planos"),
            _card("tempo_medio_acoes", "Tempo médio — ações"),
            _grafico("planos_por_status", "Planos por status", _PARTES_DO_TODO),
            _grafico("planos_por_prazo", "Planos por situação do prazo", _PARTES_DO_TODO),
            _grafico("acoes_por_status", "Ações por status", _CATEGORIAS),
            _grafico("cumprimento_prazo", "Cumprimento de prazo", _CATEGORIAS),
            _grafico("evolucao_mensal", "Evolução dos planos (mensal)", _SERIE_TEMPORAL, (6, 8)),
            _grafico("planos_por_setor", "Planos por função/cargo", _EMPILHADO, (6, 8)),
            _grafico("planos_por_area", "Planos por área", _EMPILHADO, (6, 8)),
            _grafico("planos_por_responsavel", "Planos por responsável", _EMPILHADO, (6, 8)),
            _grafico("planos_por_prioridade", "Planos por prioridade", _EMPILHADO, (6, 8)),
            _grafico("responsaveis_pendencias", "Responsáveis com ações pendentes", _EMPILHADO, (12, 9), (4, 6)),
            _grafico("itens_por_nivel", "Ações e sub-itens por nível", _EMPILHADO, (6, 8)),
            _grafico("subitens_por_responsavel", "Sub-itens por responsável", _EMPILHADO, (6, 8)),
            _grafico("itens_por_plano", "Ações e sub-itens por PA", (V.TABELA,), (10, 8), (6, 5)),
        )
    },
}

# Quem pode ver a tela pode montar o seu painel.
PERMISSAO_TELA: dict[Tela, str] = {Tela.DASHBOARD: "dashboard:ver", Tela.INDICADORES: "indicadores:ver"}


@dataclass(frozen=True)
class Widget:
    id: str
    tipo_dado: str
    tipo_visualizacao: Visualizacao
    x: int
    y: int
    largura: int
    altura: int
    visivel: bool = True


# (tipo_dado, visualização, x, y, largura, altura) — o id do widget padrão é o próprio tipo_dado.
_PADRAO: dict[Tela, list[tuple[str, Visualizacao, int, int, int, int]]] = {
    Tela.DASHBOARD: [
        # Visão geral (o detalhamento e a evolução ficam em Indicadores).
        # 1ª linha: planos (na ordem do ciclo) + progresso geral; 2ª linha: ações e sub-itens.
        ("total_planos", V.CARD_NUMERO, 0, 0, 2, 3),
        ("planos_nao_iniciados", V.CARD_NUMERO, 2, 0, 2, 3),
        ("planos_ativos", V.CARD_NUMERO, 4, 0, 2, 3),
        ("planos_atrasados", V.CARD_NUMERO, 6, 0, 2, 3),
        ("planos_concluidos", V.CARD_NUMERO, 8, 0, 2, 3),
        ("progresso_geral", V.CARD_NUMERO, 10, 0, 2, 3),
        ("total_acoes", V.CARD_NUMERO, 0, 3, 2, 3),
        ("acoes_pendentes", V.CARD_NUMERO, 2, 3, 2, 3),
        ("acoes_em_andamento", V.CARD_NUMERO, 4, 3, 2, 3),
        ("acoes_atrasadas", V.CARD_NUMERO, 6, 3, 2, 3),
        ("acoes_concluidas", V.CARD_NUMERO, 8, 3, 2, 3),
        ("total_subitens", V.CARD_NUMERO, 10, 3, 2, 3),
        # Status de execução e situação do prazo lado a lado (são coisas diferentes) + pendências.
        ("status_execucao", V.GRAFICO_BARRA, 0, 6, 4, 9),
        ("situacao_prazo", V.GRAFICO_BARRA, 4, 6, 4, 9),
        ("minhas_acoes", V.LISTA, 8, 6, 4, 9),
        ("planos_recentes", V.LISTA, 0, 15, 4, 9),
        ("atividades_recentes", V.LISTA, 4, 15, 4, 9),
        ("mini_calendario", V.CALENDARIO, 8, 15, 4, 9),
    ],
    Tela.INDICADORES: [
        # Percentuais de conclusão e de cumprimento dos prazos.
        ("pct_planos_concluidos", V.CARD_NUMERO, 0, 0, 2, 3),
        ("pct_acoes_concluidas", V.CARD_NUMERO, 2, 0, 2, 3),
        ("pct_subitens_concluidos", V.CARD_NUMERO, 4, 0, 2, 3),
        ("pct_acoes_no_prazo", V.CARD_NUMERO, 6, 0, 2, 3),
        ("pct_acoes_atrasadas", V.CARD_NUMERO, 8, 0, 2, 3),
        ("tempo_medio_planos", V.CARD_NUMERO, 10, 0, 2, 3),
        # Status global e situação do prazo lado a lado (são coisas diferentes).
        ("planos_por_status", V.GRAFICO_ROSCA, 0, 3, 3, 8),
        ("planos_por_prazo", V.GRAFICO_ROSCA, 3, 3, 3, 8),
        ("acoes_por_status", V.GRAFICO_BARRA, 6, 3, 3, 8),
        ("cumprimento_prazo", V.GRAFICO_BARRA, 9, 3, 3, 8),
        # Ações e sub-itens de todos os níveis.
        ("itens_por_nivel", V.GRAFICO_BARRA, 0, 11, 6, 8),
        ("subitens_por_responsavel", V.GRAFICO_BARRA, 6, 11, 6, 8),
        # Evolução e distribuição.
        ("evolucao_mensal", V.GRAFICO_LINHA, 0, 19, 6, 8),
        ("planos_por_setor", V.GRAFICO_BARRA, 6, 19, 6, 8),
        ("responsaveis_pendencias", V.GRAFICO_BARRA, 0, 27, 12, 9),
        ("itens_por_plano", V.TABELA, 0, 36, 10, 8),
        ("tempo_medio_acoes", V.CARD_NUMERO, 10, 36, 2, 3),
    ],
}


def layout_padrao(tela: Tela) -> list[Widget]:
    return [Widget(t, t, v, x, y, w, h) for t, v, x, y, w, h in _PADRAO[tela]]


# Widgets trazidos por cada versão do catálogo (vieram do antigo Painel de Ações, removido na versão 3).
NOVOS_NA_VERSAO: dict[int, dict[Tela, tuple[str, ...]]] = {
    3: {
        Tela.DASHBOARD: ("total_acoes", "total_subitens", "progresso_geral", "situacao_prazo"),
        Tela.INDICADORES: ("pct_subitens_concluidos", "itens_por_nivel", "subitens_por_responsavel", "itens_por_plano"),
    },
    # Status de execução dos PAs, ações e sub-itens (o detalhe do card de sub-itens não cabe num card pequeno).
    4: {Tela.DASHBOARD: ("status_execucao",)},
}


def _acrescentar_novos(tela: Tela, widgets: list[Widget], desde: int) -> list[Widget]:
    """Layout salvo numa versão anterior do catálogo: os widgets novos entram abaixo de tudo,
    no tamanho/visualização do padrão, sem mover os existentes."""
    padrao = {w.tipo_dado: w for w in layout_padrao(tela)}
    tem = {w.tipo_dado for w in widgets}
    ids = {w.id for w in widgets}
    novos = [
        t for v in sorted(NOVOS_NA_VERSAO) if v > desde for t in NOVOS_NA_VERSAO[v].get(tela, ()) if t not in tem
    ]
    y = max((w.y + w.altura for w in widgets), default=0)
    x = altura_linha = 0
    resultado = list(widgets)
    for tipo in novos:
        p = padrao[tipo]
        if x + p.largura > COLUNAS:
            y, x, altura_linha = y + altura_linha, 0, 0
        id_ = tipo if tipo not in ids else f"{tipo}-v{VERSAO_CATALOGO}"
        resultado.append(Widget(id_, tipo, p.tipo_visualizacao, x, y, p.largura, p.altura))
        x, altura_linha = x + p.largura, max(altura_linha, p.altura)
    return resultado


@dataclass(frozen=True)
class Layout:
    tela: Tela
    personalizado: bool
    widgets: list[Widget]


def validar(tela: Tela, widgets: list[Widget]) -> None:
    """Rejeita (RegraInvalida → 422) qualquer configuração que o painel não consiga exibir."""
    catalogo = CATALOGO[tela]
    if len(widgets) > MAX_WIDGETS:
        raise RegraInvalida(f"O painel aceita no máximo {MAX_WIDGETS} widgets.")
    ids: set[str] = set()
    for w in widgets:
        if not _ID_WIDGET.match(w.id):
            raise RegraInvalida(f"Id de widget inválido: {w.id!r}.")
        if w.id in ids:
            raise RegraInvalida(f"Id de widget repetido: {w.id}.")
        ids.add(w.id)
        d = catalogo.get(w.tipo_dado)
        if d is None:
            raise RegraInvalida(f"O dado {w.tipo_dado!r} não existe na tela {tela.value}.")
        if w.tipo_visualizacao not in d.visualizacoes:
            opcoes = ", ".join(v.value for v in d.visualizacoes)
            raise RegraInvalida(
                f"“{d.titulo}” não pode ser exibido como {w.tipo_visualizacao.value}. Opções: {opcoes}."
            )
        min_w, min_h = d.minimo
        if not (min_w <= w.largura <= COLUNAS):
            raise RegraInvalida(f"“{d.titulo}”: largura deve ficar entre {min_w} e {COLUNAS} colunas.")
        if not (min_h <= w.altura <= ALTURA_MAX):
            raise RegraInvalida(f"“{d.titulo}”: altura deve ficar entre {min_h} e {ALTURA_MAX} linhas.")
        if w.x < 0 or w.y < 0 or w.y > Y_MAX or w.x + w.largura > COLUNAS:
            raise RegraInvalida(f"“{d.titulo}” está fora do grid de {COLUNAS} colunas.")
    visiveis = [w for w in widgets if w.visivel]
    for i, a in enumerate(visiveis):
        for b in visiveis[i + 1 :]:
            if a.x < b.x + b.largura and b.x < a.x + a.largura and a.y < b.y + b.altura and b.y < a.y + a.altura:
                raise RegraInvalida(f"Os widgets {a.id} e {b.id} estão sobrepostos.")


def _para_json(w: Widget) -> dict:
    return {
        "id": w.id,
        "tipo_dado": w.tipo_dado,
        "tipo_visualizacao": w.tipo_visualizacao.value,
        "posicao": {"x": w.x, "y": w.y},
        "tamanho": {"largura_colunas": w.largura, "altura_linhas": w.altura},
        "visivel": w.visivel,
    }


def _de_json(d: dict) -> Widget:
    return Widget(
        id=str(d["id"]),
        tipo_dado=str(d["tipo_dado"]),
        tipo_visualizacao=Visualizacao(d["tipo_visualizacao"]),
        x=int(d["posicao"]["x"]),
        y=int(d["posicao"]["y"]),
        largura=int(d["tamanho"]["largura_colunas"]),
        altura=int(d["tamanho"]["altura_linhas"]),
        visivel=bool(d.get("visivel", True)),
    )


class PreferenciasService:
    def __init__(self, db: Session, usuario: Usuario):
        self.db = db
        self.usuario = usuario

    def _registro(self, tela: Tela) -> PreferenciaLayout | None:
        return self.db.scalar(
            select(PreferenciaLayout).where(PreferenciaLayout.usuario_id == self.usuario.id, PreferenciaLayout.tela == tela.value)
        )

    def obter(self, tela: Tela) -> Layout:
        reg = self._registro(tela)
        if reg is None or not isinstance(reg.config, dict) or reg.config.get("versao") != VERSAO_CONFIG:
            return Layout(tela, False, layout_padrao(tela))
        try:
            widgets = [_de_json(d) for d in reg.config.get("widgets", [])]
            validar(tela, widgets)  # o catálogo pode ter mudado desde que foi salvo
            versao = int(reg.config.get("catalogo", 2))
            if versao < VERSAO_CATALOGO:
                widgets = _acrescentar_novos(tela, widgets, versao)
                validar(tela, widgets)
        except (KeyError, TypeError, ValueError, RegraInvalida):
            return Layout(tela, False, layout_padrao(tela))
        return Layout(tela, True, widgets)

    def salvar(self, tela: Tela, widgets: list[Widget]) -> Layout:
        validar(tela, widgets)
        config = {"versao": VERSAO_CONFIG, "catalogo": VERSAO_CATALOGO, "widgets": [_para_json(w) for w in widgets]}
        reg = self._registro(tela)
        if reg is None:
            self.db.add(PreferenciaLayout(usuario_id=self.usuario.id, tela=tela.value, config=config))
        else:
            reg.config = config
        self.db.commit()
        return Layout(tela, True, widgets)

    def restaurar(self, tela: Tela) -> Layout:
        """Apaga a personalização: o usuário volta a ver o painel padrão."""
        self.db.execute(
            delete(PreferenciaLayout).where(PreferenciaLayout.usuario_id == self.usuario.id, PreferenciaLayout.tela == tela.value)
        )
        self.db.commit()
        return Layout(tela, False, layout_padrao(tela))
