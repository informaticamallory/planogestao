"""Cálculo único dos indicadores de um conjunto de ações.

Usado pelo detalhe/resumo do plano e pela aba Indicadores, para os números sempre baterem.
As mesmas definições valem no dashboard (regras.py).
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime

from app.models.enums import StatusAcao
from app.services.regras import TagPrazo, acao_concluida_no_prazo, tag_prazo_acao


@dataclass(frozen=True)
class IndicadoresAcoes:
    total: int  # sem recusadas/canceladas
    pendentes: int  # Não iniciado
    em_andamento: int  # Em andamento
    concluidas: int  # Concluído
    atrasadas: int  # Tag Em atraso (apenas não concluídas)
    a_vencer: int  # Tag A vencer (apenas não concluídas)
    no_prazo: int  # Tag No prazo (apenas não concluídas)
    sem_prazo: int  # Tag Sem prazo (apenas não concluídas)
    descartadas: int  # recusadas + canceladas (informativo)
    progresso: int  # média do progresso, sem descartadas
    concluidas_no_prazo: int
    concluidas_com_atraso: int
    abertas_no_prazo: int  # a_vencer + no_prazo (ainda não venceram)
    percentual_cumprimento: float | None  # no prazo / (concluídas + atrasadas)


def calcular_indicadores(
    acoes: Iterable[tuple[StatusAcao, date, int, datetime | None]], hoje: date
) -> IndicadoresAcoes:
    """`acoes`: tuplas (status, prazo, progresso, concluida_em)."""
    pendentes = em_andamento = concluidas = descartadas = soma_progresso = no_prazo_cumprimento = 0
    atrasadas = a_vencer = no_prazo = sem_prazo = 0

    for status, prazo, progresso, concluida_em in acoes:
        if status in (StatusAcao.RECUSADA, StatusAcao.CANCELADA):
            descartadas += 1
            continue

        # Status de execução (apenas 3 status válidos)
        if status == StatusAcao.CONCLUIDA:
            concluidas += 1
            if acao_concluida_no_prazo(status, prazo, concluida_em):
                no_prazo_cumprimento += 1
        elif status in (StatusAcao.EM_ANDAMENTO, StatusAcao.BLOQUEADA):
            em_andamento += 1
        else:
            pendentes += 1

        soma_progresso += progresso

        # Situação do prazo (apenas itens em aberto / não concluídos)
        if status != StatusAcao.CONCLUIDA:
            t = tag_prazo_acao(status, prazo, hoje)
            if t == TagPrazo.EM_ATRASO:
                atrasadas += 1
            elif t == TagPrazo.A_VENCER:
                a_vencer += 1
            elif t == TagPrazo.NO_PRAZO:
                no_prazo += 1
            elif t == TagPrazo.SEM_PRAZO:
                sem_prazo += 1

    total = pendentes + em_andamento + concluidas
    base_cumprimento = concluidas + atrasadas
    return IndicadoresAcoes(
        total=total,
        pendentes=pendentes,
        em_andamento=em_andamento,
        concluidas=concluidas,
        atrasadas=atrasadas,
        a_vencer=a_vencer,
        no_prazo=no_prazo,
        sem_prazo=sem_prazo,
        descartadas=descartadas,
        progresso=round(soma_progresso / total) if total else 0,
        concluidas_no_prazo=no_prazo_cumprimento,
        concluidas_com_atraso=concluidas - no_prazo_cumprimento,
        abertas_no_prazo=a_vencer + no_prazo,
        percentual_cumprimento=round(100 * no_prazo_cumprimento / base_cumprimento, 1) if base_cumprimento else None,
    )
