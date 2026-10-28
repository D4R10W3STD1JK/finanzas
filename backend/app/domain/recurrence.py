"""Motor de recurrencias: funciones puras, sin base de datos.

Cada fecha de una serie se calcula directamente desde su ancla (``anchor + k * paso``)
y no desde la ocurrencia anterior. Así una serie mensual del día 31 vuelve al 31
después de febrero en lugar de quedarse en el 28.
"""

import calendar
from collections.abc import Callable, Hashable, Iterator, Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from enum import StrEnum


class Frequency(StrEnum):
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    SEMIANNUAL = "semiannual"
    YEARLY = "yearly"
    CUSTOM = "custom"


class Unit(StrEnum):
    DAY = "day"
    WEEK = "week"
    MONTH = "month"


class BusinessDayAdjust(StrEnum):
    NONE = "none"
    PREVIOUS = "previous"
    NEXT = "next"


LAST_DAY = -1

_BASE_STEP: dict[Frequency, tuple[Unit, int]] = {
    Frequency.DAILY: (Unit.DAY, 1),
    Frequency.WEEKLY: (Unit.WEEK, 1),
    Frequency.MONTHLY: (Unit.MONTH, 1),
    Frequency.QUARTERLY: (Unit.MONTH, 3),
    Frequency.SEMIANNUAL: (Unit.MONTH, 6),
    Frequency.YEARLY: (Unit.MONTH, 12),
}


def step_of(frequency: Frequency, interval: int = 1, unit: Unit | None = None) -> tuple[Unit, int]:
    """Unidad y tamaño del paso. ``interval`` multiplica el paso base (mensual cada 2 = bimestral)."""
    if interval < 1:
        raise ValueError("El intervalo debe ser al menos 1")
    if frequency == Frequency.CUSTOM:
        if unit is None:
            raise ValueError("La frecuencia personalizada necesita una unidad")
        return unit, interval
    base_unit, base_n = _BASE_STEP[frequency]
    return base_unit, base_n * interval


def months_per_period(frequency: Frequency, interval: int = 1, unit: Unit | None = None) -> float:
    """Duración del periodo en meses (para provisiones y coste mensual equivalente)."""
    u, n = step_of(frequency, interval, unit)
    if u == Unit.MONTH:
        return float(n)
    days = n * (7 if u == Unit.WEEK else 1)
    return days * 12 / 365.25


def clamp_day(year: int, month: int, day: int) -> date:
    last = calendar.monthrange(year, month)[1]
    return date(year, month, last if day == LAST_DAY else min(day, last))


@dataclass(frozen=True)
class ScheduleRule:
    anchor: date
    frequency: Frequency
    interval: int = 1
    unit: Unit | None = None
    # Solo para unidades de mes: día 1..31 o -1 (último día). Si es None se usa el día del ancla.
    day_of_month: int | None = None
    adjust: BusinessDayAdjust = BusinessDayAdjust.NONE

    def nth(self, k: int) -> date:
        """Fecha teórica k-ésima (sin ajuste por día hábil); puede ser anterior al ancla."""
        unit, n = step_of(self.frequency, self.interval, self.unit)
        if unit == Unit.DAY:
            return self.anchor + timedelta(days=k * n)
        if unit == Unit.WEEK:
            return self.anchor + timedelta(weeks=k * n)
        total = self.anchor.year * 12 + (self.anchor.month - 1) + k * n
        year, month0 = divmod(total, 12)
        return clamp_day(year, month0 + 1, self.day_of_month or self.anchor.day)

    def dates(self) -> Iterator[date]:
        """Fechas teóricas a partir del ancla, en orden creciente e infinitas."""
        k = 0
        while True:
            d = self.nth(k)
            if d >= self.anchor:
                yield d
            k += 1


def adjust_to_business_day(
    d: date, mode: BusinessDayAdjust, is_business_day: Callable[[date], bool] | None
) -> date:
    if mode == BusinessDayAdjust.NONE or is_business_day is None:
        return d
    delta = timedelta(days=-1 if mode == BusinessDayAdjust.PREVIOUS else 1)
    for _ in range(31):  # salvaguarda: nunca hay más de unos pocos días seguidos no hábiles
        if is_business_day(d):
            return d
        d += delta
    raise ValueError("No se encontró un día hábil cercano")


def weekdays_only(d: date) -> bool:
    return d.weekday() < 5


@dataclass(frozen=True)
class ScheduledItem[K: Hashable]:
    key: K  # identifica la versión (tramo) que genera esta fecha
    index: int  # posición en la serie completa, empezando en 0
    scheduled: date  # fecha teórica: identidad estable de la ocurrencia
    due: date  # fecha efectiva tras ajustar al día hábil


def build_schedule[K: Hashable](
    versions: Sequence[tuple[K, ScheduleRule]],
    until: date,
    end_date: date | None = None,
    max_count: int | None = None,
    is_business_day: Callable[[date], bool] | None = None,
) -> list[ScheduledItem[K]]:
    """Calendario de una serie formada por tramos consecutivos.

    Cada tramo es válido desde su ancla hasta el ancla del siguiente (sin incluirla).
    Se corta en ``until``, en ``end_date`` (sobre la fecha teórica) o al alcanzar ``max_count``.
    """
    ordered = sorted(versions, key=lambda v: v[1].anchor)
    stop = min(until, end_date) if end_date else until
    items: list[ScheduledItem[K]] = []
    for i, (key, rule) in enumerate(ordered):
        limit = ordered[i + 1][1].anchor if i + 1 < len(ordered) else None
        for d in rule.dates():
            if d > stop or (limit is not None and d >= limit):
                break
            if max_count is not None and len(items) >= max_count:
                return items
            due = adjust_to_business_day(d, rule.adjust, is_business_day)
            items.append(ScheduledItem(key=key, index=len(items), scheduled=d, due=due))
    return items
