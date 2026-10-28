"""Coste equivalente de un recurrente: cuánto supone al año y al mes, sea cual sea su frecuencia."""

from decimal import ROUND_HALF_UP, Decimal

from app.domain.recurrence import Frequency, Unit, step_of

CENT = Decimal("0.01")
DAYS_PER_YEAR = Decimal("365.25")
WEEKS_PER_YEAR = DAYS_PER_YEAR / 7


def periods_per_year(frequency: Frequency, interval: int = 1, unit: Unit | None = None) -> Decimal:
    u, n = step_of(frequency, interval, unit)
    if u == Unit.MONTH:
        return Decimal(12) / n
    if u == Unit.WEEK:
        return WEEKS_PER_YEAR / n
    return DAYS_PER_YEAR / n


def money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def annual_cost(amount: Decimal, frequency: Frequency, interval: int = 1, unit: Unit | None = None) -> Decimal:
    return money(amount * periods_per_year(frequency, interval, unit))


def monthly_cost(amount: Decimal, frequency: Frequency, interval: int = 1, unit: Unit | None = None) -> Decimal:
    return money(amount * periods_per_year(frequency, interval, unit) / 12)
