"""Indicadores analíticos.

Os filtros (período de criação, área, setor, responsável do plano) definem UM conjunto de
planos; todas as métricas de ações usam as ações desses planos. Assim os filtros têm o mesmo
significado em todos os gráficos, e o total de planos bate com a listagem de Planos.

Com `responsaveis` (ex.: Equipes), o recorte é por pessoa: planos cujo responsável está no
conjunto e ações (dos planos do período) cujo responsável está no conjunto. O cálculo é o mesmo.
"""

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date

from sqlalchemy import ColumnElement, and_, select
from sqlalchemy.orm import Session

from app.core.tempo import data_local
from app.models import Acao, Area, PlanoDeAcao, Setor, Usuario
from app.models.enums import STATUS_ACAO_DESCARTADOS, StatusAcao, StatusPlano
from app.services.escopo import filtro_planos_visiveis
from app.services.indicadores import calcular_indicadores
from app.services.periodo import Periodo
from app.services.regras import (
    CategoriaAcao,
    SituacaoPrazo,
    TagPrazo,
    categoria_acao,
    situacao_prazo,
    tag_prazo_acao,
    tag_prazo_plano,
)


@dataclass
class FiltrosIndicadores:
    periodo: Periodo
    area_id: int | None = None
    setor_id: int | None = None
    responsavel_id: int | None = None
    # Conjunto de pessoas (ex.: membros de uma equipe): planos cujo RESPONSÁVEL DO PLANO está no
    # conjunto e ações cujo RESPONSÁVEL DA AÇÃO está no conjunto. Vazio = nenhum resultado.
    responsaveis: frozenset[int] | None = None


def _pct(parte: int, total: int) -> float | None:
    return round(100 * parte / total, 1) if total else None


ORDEM_STATUS = [StatusPlano.NAO_INICIADO.value, StatusPlano.EM_ANDAMENTO.value, StatusPlano.CONCLUIDO.value]
ORDEM_PRAZO = [TagPrazo.EM_ATRASO.value, TagPrazo.A_VENCER.value, TagPrazo.NO_PRAZO.value]


class IndicadoresService:
    def __init__(self, db: Session, usuario: Usuario, hoje: date):
        self.db = db
        self.usuario = usuario
        self.hoje = hoje

    def _filtro_planos(self, f: FiltrosIndicadores) -> ColumnElement[bool]:
        """Conjunto de planos analisado (período de criação, área, setor, responsável, visibilidade)."""
        condicoes = [
            filtro_planos_visiveis(self.usuario),
            PlanoDeAcao.criado_em >= f.periodo.inicio_utc,
            PlanoDeAcao.criado_em < f.periodo.fim_exclusivo_utc,
        ]
        if f.area_id is not None:
            condicoes.append(PlanoDeAcao.area_id == f.area_id)
        if f.setor_id is not None:
            condicoes.append(PlanoDeAcao.setor_id == f.setor_id)
        if f.responsavel_id is not None:
            condicoes.append(PlanoDeAcao.responsavel_id == f.responsavel_id)
        return and_(*condicoes)

    def _planos(self, f: FiltrosIndicadores):
        return self.db.execute(
            select(
                PlanoDeAcao.id, PlanoDeAcao.status, PlanoDeAcao.data_fim_estimado, PlanoDeAcao.prioridade,
                PlanoDeAcao.data_inicio_estimado, PlanoDeAcao.concluido_em, PlanoDeAcao.criado_em,
                PlanoDeAcao.area_id, Area.nome.label("area_nome"),
                PlanoDeAcao.setor_id, Setor.nome.label("setor_nome"),
                PlanoDeAcao.responsavel_id, Usuario.nome.label("responsavel_nome"),
            )
            .join(Area, PlanoDeAcao.area_id == Area.id)
            .outerjoin(Setor, PlanoDeAcao.setor_id == Setor.id)
            .join(Usuario, PlanoDeAcao.responsavel_id == Usuario.id)
            .where(self._filtro_planos(f), *self._por_pessoas(PlanoDeAcao.responsavel_id, f))
        ).all()

    @staticmethod
    def _por_pessoas(coluna, f: FiltrosIndicadores) -> list[ColumnElement[bool]]:
        return [] if f.responsaveis is None else [coluna.in_(sorted(f.responsaveis))]

    def _acoes(self, f: FiltrosIndicadores):
        return self.db.execute(
            select(
                Acao.status, Acao.prazo, Acao.progresso, Acao.concluida_em, Acao.criado_em,
                Acao.responsavel_id, Usuario.nome.label("responsavel_nome"),
            )
            .join(PlanoDeAcao, Acao.plano_id == PlanoDeAcao.id)
            .join(Usuario, Acao.responsavel_id == Usuario.id)
            # Subações não entram nos indicadores (são desdobramentos da ação principal).
            .where(self._filtro_planos(f), Acao.acao_pai_id.is_(None), Acao.arquivado_em.is_(None), *self._por_pessoas(Acao.responsavel_id, f))
        ).all()

    def _itens(self, f: FiltrosIndicadores) -> list[dict]:
        """Ações principais e sub-itens de TODOS os níveis dos planos filtrados, sem recusados/cancelados.
        Um registro por item (pelo id): nada é somado a partir dos descendentes. `nivel` 0 = ação principal."""
        linhas = self.db.execute(
            select(
                Acao.id, Acao.acao_pai_id, Acao.status, Acao.prazo, Acao.responsavel_id, Acao.arquivado_em,
                Usuario.nome.label("responsavel_nome"),
                PlanoDeAcao.id.label("plano_id"), PlanoDeAcao.codigo, PlanoDeAcao.nome.label("plano_nome"),
            )
            .join(PlanoDeAcao, Acao.plano_id == PlanoDeAcao.id)
            .join(Usuario, Acao.responsavel_id == Usuario.id)
            .where(self._filtro_planos(f))
        ).all()
        # A profundidade vem da cadeia de pais (inclusive pais descartados, que não são contados).
        pai = {r.id: r.acao_pai_id for r in linhas}

        def nivel(i: int) -> int:
            n, p = 0, pai.get(i)
            while p is not None:
                n, p = n + 1, pai.get(p)
            return n

        pessoas = f.responsaveis
        return [
            {**r._asdict(), "nivel": nivel(r.id), "categoria": categoria_acao(r.status, r.prazo, self.hoje)}
            for r in linhas
            # Arquivados ficam fora (mas continuam no mapa de pais, para a profundidade não mudar).
            if r.status not in STATUS_ACAO_DESCARTADOS and r.arquivado_em is None and (pessoas is None or r.responsavel_id in pessoas)
        ]

    # ---- KPIs ------------------------------------------------------------------------------

    def gerais(self, f: FiltrosIndicadores) -> dict:
        planos = self._planos(f)
        acoes = self._acoes(f)
        ind = calcular_indicadores(((a.status, a.prazo, a.progresso, a.concluida_em) for a in acoes), self.hoje)

        concluidos = [p for p in planos if p.status == StatusPlano.CONCLUIDO]
        dias_planos = [(data_local(p.concluido_em) - p.data_inicio_estimado).days for p in concluidos if p.concluido_em]
        dias_acoes = [
            (data_local(a.concluida_em) - data_local(a.criado_em)).days
            for a in acoes
            if a.status == StatusAcao.CONCLUIDA and a.concluida_em
        ]
        return {
            "total_planos": len(planos),
            "planos_concluidos": len(concluidos),
            "planos_em_atraso": sum(tag_prazo_plano(p.status, p.data_fim_estimado, self.hoje) == TagPrazo.EM_ATRASO for p in planos),
            "percentual_planos_concluidos": _pct(len(concluidos), len(planos)),
            "total_acoes": ind.total,
            "acoes_concluidas": ind.concluidas,
            "acoes_atrasadas": ind.atrasadas,
            "percentual_acoes_concluidas": _pct(ind.concluidas, ind.total),
            "percentual_acoes_no_prazo": ind.percentual_cumprimento,
            "percentual_acoes_atrasadas": _pct(ind.atrasadas, ind.total),
            **self._resumo_subitens(f),
            "tempo_medio_conclusao_planos_dias": round(sum(dias_planos) / len(dias_planos), 1) if dias_planos else None,
            "tempo_medio_conclusao_acoes_dias": round(sum(dias_acoes) / len(dias_acoes), 1) if dias_acoes else None,
        }

    def _resumo_subitens(self, f: FiltrosIndicadores) -> dict:
        subitens = [i for i in self._itens(f) if i["nivel"] > 0]
        concluidos = sum(i["categoria"] == CategoriaAcao.CONCLUIDA for i in subitens)
        return {
            "total_subitens": len(subitens),
            "subitens_concluidos": concluidos,
            "percentual_subitens_concluidos": _pct(concluidos, len(subitens)),
        }

    # ---- distribuições ------------------------------------------------------------------------

    def planos_por_status(self, f: FiltrosIndicadores) -> list[dict]:
        """Só os 3 status globais (a situação do prazo está em `planos_por_prazo`)."""
        contagem = Counter(p.status.value for p in self._planos(f))
        return [{"status": s, "total": contagem[s]} for s in ORDEM_STATUS]

    def planos_por_prazo(self, f: FiltrosIndicadores) -> list[dict]:
        """Planos não concluídos pela tag de prazo do fim estimado (em atraso, a vencer, no prazo)."""
        contagem = Counter(
            t.value for p in self._planos(f) if (t := tag_prazo_plano(p.status, p.data_fim_estimado, self.hoje))
        )
        return [{"status": s, "total": contagem[s]} for s in ORDEM_PRAZO]

    def acoes_por_status(self, f: FiltrosIndicadores) -> list[dict]:
        """Só os 3 status de execução (mesmos valores dos planos); recusadas/canceladas ficam de fora
        e a situação do prazo não entra aqui (ver `cumprimento_prazo`)."""
        ind = calcular_indicadores(((a.status, a.prazo, a.progresso, a.concluida_em) for a in self._acoes(f)), self.hoje)
        totais = {"nao_iniciado": ind.pendentes, "em_andamento": ind.em_andamento, "concluido": ind.concluidas}
        return [{"status": s, "total": totais[s]} for s in ORDEM_STATUS]

    def cumprimento_prazo(self, f: FiltrosIndicadores) -> dict:
        acoes = self._acoes(f)
        ind = calcular_indicadores(((a.status, a.prazo, a.progresso, a.concluida_em) for a in acoes), self.hoje)
        return {
            "concluidas_no_prazo": ind.concluidas_no_prazo,
            "concluidas_com_atraso": ind.concluidas_com_atraso,
            "atrasadas_em_aberto": ind.atrasadas,
            "em_aberto_no_prazo": ind.abertas_no_prazo,
            "percentual_no_prazo": ind.percentual_cumprimento,
        }

    def planos_por(self, f: FiltrosIndicadores, dimensao: str) -> list[dict]:
        """Planos agrupados por área/setor/responsável/prioridade, com a quebra por situação."""
        grupos: dict[tuple, Counter] = defaultdict(Counter)
        for p in self._planos(f):
            if dimensao == "area":
                chave = (p.area_id, p.area_nome)
            elif dimensao == "setor":
                chave = (p.setor_id, p.setor_nome or "Sem função/cargo")
            elif dimensao == "responsavel":
                chave = (p.responsavel_id, p.responsavel_nome)
            else:
                chave = (None, p.prioridade.value)
            grupos[chave][p.status.value] += 1
            # A tag de prazo é contada à parte (um plano em andamento pode estar em atraso).
            if tag_prazo_plano(p.status, p.data_fim_estimado, self.hoje) == TagPrazo.EM_ATRASO:
                grupos[chave]["_em_atraso"] += 1

        itens = [
            {
                "id": id_,
                "nome": nome,
                "total": c["nao_iniciado"] + c["em_andamento"] + c["concluido"],
                "nao_iniciados": c["nao_iniciado"],
                "em_andamento": c["em_andamento"],
                "concluidos": c["concluido"],
                "em_atraso": c["_em_atraso"],
            }
            for (id_, nome), c in grupos.items()
        ]
        if dimensao == "prioridade":
            ordem = ["critica", "alta", "media", "baixa"]
            return sorted(itens, key=lambda i: ordem.index(i["nome"]))
        return sorted(itens, key=lambda i: (-i["total"], i["nome"]))

    def responsaveis_com_pendencias(self, f: FiltrosIndicadores, limite: int) -> list[dict]:
        """Responsáveis (das ações) com ações em aberto, dos que têm mais atrasadas para os que têm menos."""
        grupos: dict[tuple[int, str], Counter] = defaultdict(Counter)
        for a in self._acoes(f):
            situacao = situacao_prazo(a.status, a.prazo, self.hoje)
            if situacao in (SituacaoPrazo.ATRASADA, SituacaoPrazo.VENCENDO, SituacaoPrazo.EM_ANDAMENTO):
                grupos[(a.responsavel_id, a.responsavel_nome)][situacao] += 1
        itens = [
            {
                "id": id_,
                "nome": nome,
                "atrasadas": c[SituacaoPrazo.ATRASADA],
                "vencendo": c[SituacaoPrazo.VENCENDO],
                "em_andamento": c[SituacaoPrazo.EM_ANDAMENTO],
                "total_pendentes": sum(c.values()),
            }
            for (id_, nome), c in grupos.items()
        ]
        itens.sort(key=lambda i: (-i["atrasadas"], -i["total_pendentes"], i["nome"]))
        return itens[:limite]

    # ---- ações e sub-itens (todos os níveis) ------------------------------------------------------

    @staticmethod
    def _por_status(itens: list[dict]) -> dict:
        c = Counter(i["categoria"] for i in itens)
        return {
            "nao_iniciado": c[CategoriaAcao.PENDENTE],
            "em_andamento": c[CategoriaAcao.EM_ANDAMENTO],
            "concluido": c[CategoriaAcao.CONCLUIDA],
            "total": len(itens),
        }

    def itens_por_nivel(self, f: FiltrosIndicadores) -> list[dict]:
        """Status de execução por nível da hierarquia: ações principais, sub-itens de nível 1 (x.y), 2…"""
        niveis: dict[int, list[dict]] = defaultdict(list)
        for i in self._itens(f):
            niveis[i["nivel"]].append(i)
        return [
            {"nivel": n, "nome": "Ações principais" if n == 0 else f"Sub-itens nível {n}", **self._por_status(niveis[n])}
            for n in sorted(niveis)
        ]

    def subitens_por_responsavel(self, f: FiltrosIndicadores) -> list[dict]:
        """Sub-itens (todos os níveis) por responsável do próprio sub-item, com o status de execução."""
        grupos: dict[tuple[int, str], list[dict]] = defaultdict(list)
        for i in self._itens(f):
            if i["nivel"] > 0:
                grupos[(i["responsavel_id"], i["responsavel_nome"])].append(i)
        itens = [{"id": id_, "nome": nome, **self._por_status(lista)} for (id_, nome), lista in grupos.items()]
        return sorted(itens, key=lambda g: (-g["total"], g["nome"]))

    def itens_por_plano(self, f: FiltrosIndicadores) -> list[dict]:
        """Por PA: ações principais, sub-itens e, contando todos os itens, concluídos, pendentes e em atraso."""
        planos: dict[int, dict] = {}
        for i in self._itens(f):
            p = planos.setdefault(
                i["plano_id"],
                {"id": i["plano_id"], "codigo": i["codigo"], "nome": i["plano_nome"], "acoes_principais": 0,
                 "subitens": 0, "concluidos": 0, "pendentes": 0, "em_atraso": 0},
            )
            p["subitens" if i["nivel"] > 0 else "acoes_principais"] += 1
            p["concluidos" if i["categoria"] == CategoriaAcao.CONCLUIDA else "pendentes"] += 1
            p["em_atraso"] += tag_prazo_acao(i["status"], i["prazo"], self.hoje) == TagPrazo.EM_ATRASO
        return sorted(planos.values(), key=lambda p: p["codigo"])

    def evolucao_mensal(self, f: FiltrosIndicadores) -> list[dict]:
        """Por mês do período: planos criados, concluídos e que venceram sem conclusão até o prazo."""
        planos = self._planos(f)
        meses: list[date] = []
        ano, mes = f.periodo.inicio.year, f.periodo.inicio.month
        while date(ano, mes, 1) <= f.periodo.fim:
            meses.append(date(ano, mes, 1))
            ano, mes = (ano + 1, 1) if mes == 12 else (ano, mes + 1)

        def chave(d: date) -> date:
            return d.replace(day=1)

        criados: Counter[date] = Counter()
        concluidos: Counter[date] = Counter()
        atrasados: Counter[date] = Counter()
        for p in planos:
            criados[chave(data_local(p.criado_em))] += 1
            dia_conclusao = data_local(p.concluido_em) if p.concluido_em else None
            if p.status == StatusPlano.CONCLUIDO and dia_conclusao and f.periodo.contem(dia_conclusao):
                concluidos[chave(dia_conclusao)] += 1
            estourou = p.data_fim_estimado < self.hoje and (dia_conclusao is None or dia_conclusao > p.data_fim_estimado)
            if estourou and f.periodo.contem(p.data_fim_estimado):
                atrasados[chave(p.data_fim_estimado)] += 1
        return [
            {"mes": m.isoformat()[:7], "criados": criados[m], "concluidos": concluidos[m], "atrasados": atrasados[m]}
            for m in meses
        ]
