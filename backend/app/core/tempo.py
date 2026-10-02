"""Conversões entre o fuso do negócio (Settings.TIMEZONE) e UTC, que é como o banco guarda DATETIME."""

from datetime import UTC, date, datetime, time
from functools import lru_cache
from zoneinfo import ZoneInfo

from app.core.config import get_settings


@lru_cache
def fuso_local() -> ZoneInfo:
    return ZoneInfo(get_settings().TIMEZONE)


def hoje_local() -> date:
    return datetime.now(fuso_local()).date()


def inicio_do_dia_utc(dia: date) -> datetime:
    """00:00 local de `dia`, expresso em UTC naive (para comparar com colunas DATETIME)."""
    return datetime.combine(dia, time.min, fuso_local()).astimezone(UTC).replace(tzinfo=None)


def data_local(momento_utc: datetime) -> date:
    """Data local de um DATETIME gravado em UTC naive."""
    return momento_utc.replace(tzinfo=UTC).astimezone(fuso_local()).date()


def como_utc(momento_utc: datetime) -> datetime:
    """Marca um DATETIME naive (UTC) com tzinfo, para a API serializar com offset."""
    return momento_utc.replace(tzinfo=UTC)
