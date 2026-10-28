import datetime as dt
from datetime import date

from pydantic import Field, model_validator

from app.models.enums import (
    AmountMode,
    BusinessDayAdjust,
    Frequency,
    OccurrenceStatus,
    TransactionKind,
    Unit,
)
from app.schemas.common import Money, PositiveMoney, Schema
from app.schemas.core import TagOut


class VersionTerms(Schema):
    """Condiciones de un tramo de la serie."""

    frequency: Frequency
    interval: int = Field(default=1, ge=1, le=366)
    unit: Unit | None = None
    day_of_month: int | None = Field(default=None, ge=-1, le=31)
    business_day_adjust: BusinessDayAdjust = BusinessDayAdjust.NONE
    amount_mode: AmountMode = AmountMode.FIXED
    amount: PositiveMoney
    account_id: int
    to_account_id: int | None = None
    category_id: int | None = None
    concept: str = Field(min_length=1, max_length=200)
    tag_ids: list[int] = []

    @model_validator(mode="after")
    def _check(self):
        if self.frequency == Frequency.CUSTOM and self.unit is None:
            raise ValueError("La frecuencia personalizada necesita una unidad (días, semanas o meses)")
        if self.frequency != Frequency.CUSTOM:
            self.unit = None
        if self.day_of_month == 0:
            raise ValueError("El día del mes debe estar entre 1 y 31, o ser -1 (último día)")
        if self.to_account_id is not None and self.to_account_id == self.account_id:
            raise ValueError("Las cuentas de origen y destino deben ser distintas")
        return self


class SeriesIn(Schema):
    name: str = Field(min_length=1, max_length=100)
    kind: TransactionKind
    is_subscription: bool = False
    auto_confirm: bool = True
    start_date: date
    end_date: date | None = None
    max_occurrences: int | None = Field(default=None, ge=1)
    notes: str | None = None
    # Si es True se generan (y, si toca, se confirman) también las ocurrencias anteriores a hoy.
    include_past: bool = False
    terms: VersionTerms

    @model_validator(mode="after")
    def _check(self):
        if self.kind == TransactionKind.ADJUSTMENT:
            raise ValueError("Un recurrente no puede ser un ajuste")
        if self.end_date and self.end_date < self.start_date:
            raise ValueError("La fecha de fin no puede ser anterior a la de inicio")
        return self


class SeriesPatch(Schema):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    is_subscription: bool | None = None
    auto_confirm: bool | None = None
    end_date: date | None = None
    max_occurrences: int | None = Field(default=None, ge=1)
    notes: str | None = None


class NewVersionIn(Schema):
    """Cambiar la serie "a partir de esta fecha"."""

    effective_from: date
    terms: VersionTerms


class VersionOut(Schema):
    id: int
    effective_from: date
    frequency: Frequency
    interval: int
    unit: Unit | None
    day_of_month: int | None
    business_day_adjust: BusinessDayAdjust
    amount_mode: AmountMode
    amount: Money
    account_id: int
    to_account_id: int | None
    category_id: int | None
    concept: str
    tags: list[TagOut]


class OccurrenceOut(Schema):
    id: int
    series_id: int
    series_name: str
    kind: TransactionKind
    is_subscription: bool
    amount_mode: AmountMode
    scheduled_date: date
    due_date: date
    expected_amount: Money
    status: OccurrenceStatus
    is_overridden: bool
    notes: str | None
    account_id: int | None
    to_account_id: int | None
    category_id: int | None
    concept: str | None
    transaction_id: int | None
    actual_amount: Money | None


class SeriesOut(Schema):
    id: int
    name: str
    kind: TransactionKind
    is_subscription: bool
    auto_confirm: bool
    start_date: date
    end_date: date | None
    max_occurrences: int | None
    track_from: date
    notes: str | None
    current: VersionOut
    next_occurrence: OccurrenceOut | None
    pending_count: int
    finished: bool


class SeriesDetail(SeriesOut):
    versions: list[VersionOut]
    occurrences: list[OccurrenceOut]


class OccurrencePatch(Schema):
    due_date: date | None = None
    expected_amount: PositiveMoney | None = None
    notes: str | None = None


class ConfirmIn(Schema):
    amount: PositiveMoney | None = None
    date: dt.date | None = None
    account_id: int | None = None
    category_id: int | None = None
    notes: str | None = None
