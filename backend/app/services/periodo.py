"""Filtro de período compartilhado por dashboard, listagens e relatórios."""

import enum
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Literal

from app.core.tempo import inicio_do_dia_utc

Granularidade = Literal["dia", "semana", "mes"]

MAX_DIAS_PERSONALIZADO = 366 * 2


class TipoPeriodo(str, enum.Enum):
    HOJE = "hoje"
    ULTIMOS_7_DIAS = "7d"
    ULTIMOS_30_DIAS = "30d"
    MES_ATUAL = "mes_atual"
    TRIMESTRE = "trimestre"
    ANO = "ano"
    PERSONALIZADO = "personalizado"


class PeriodoInvalido(ValueError):
    pass


@dataclass(frozen=True)
class Periodo:
    tipo: TipoPeriodo
    inicio: date  # inclusivo, data local
    fim: date  # inclusivo, data local

    @property
    def inicio_utc(self) -> datetime:
        return inicio_do_dia_utc(self.inicio)

    @property
    def fim_exclusivo_utc(self) -> datetime:
        return inicio_do_dia_utc(self.fim + timedelta(days=1))

    def contem(self, dia: date) -> bool:
        return self.inicio <= dia <= self.fim

    @property
    def granularidade(self) -> Granularidade:
        dias = (self.fim - self.inicio).days + 1
        if dias <= 62:
            return "dia"
        if dias <= 185:
            return "semana"
        return "mes"

    def intervalos(self) -> list[tuple[date, date]]:
        """Intervalos [início, fim] (inclusivos) para séries temporais, cobrindo o período inteiro."""
        resultado: list[tuple[date, date]] = []
        atual = self.inicio
        while atual <= self.fim:
            if self.granularidade == "dia":
                fim = atual
            elif self.granularidade == "semana":
                fim = atual + timedelta(days=6 - atual.weekday())  # até domingo
            else:
                proximo_mes = (atual.replace(day=1) + timedelta(days=32)).replace(day=1)
                fim = proximo_mes - timedelta(days=1)
            fim = min(fim, self.fim)
            resultado.append((atual, fim))
            atual = fim + timedelta(days=1)
        return resultado


def resolver_periodo(
    tipo: TipoPeriodo, hoje: date, data_inicio: date | None = None, data_fim: date | None = None
) -> Periodo:
    if tipo == TipoPeriodo.PERSONALIZADO:
        if data_inicio is None or data_fim is None:
            raise PeriodoInvalido("Informe data_inicio e data_fim para o período personalizado.")
        if data_inicio > data_fim:
            raise PeriodoInvalido("data_inicio deve ser anterior ou igual a data_fim.")
        if (data_fim - data_inicio).days + 1 > MAX_DIAS_PERSONALIZADO:
            raise PeriodoInvalido(f"O período personalizado pode ter no máximo {MAX_DIAS_PERSONALIZADO} dias.")
        return Periodo(tipo, data_inicio, data_fim)

    if tipo == TipoPeriodo.HOJE:
        inicio = hoje
    elif tipo == TipoPeriodo.ULTIMOS_7_DIAS:
        inicio = hoje - timedelta(days=6)
    elif tipo == TipoPeriodo.ULTIMOS_30_DIAS:
        inicio = hoje - timedelta(days=29)
    elif tipo == TipoPeriodo.MES_ATUAL:
        inicio = hoje.replace(day=1)
    elif tipo == TipoPeriodo.TRIMESTRE:
        # Trimestre civil corrente (jan-mar, abr-jun, jul-set, out-dez).
        inicio = date(hoje.year, 3 * ((hoje.month - 1) // 3) + 1, 1)
    else:
        inicio = date(hoje.year, 1, 1)
    return Periodo(tipo, inicio, hoje)
