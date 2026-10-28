import datetime as dt
from datetime import date
from decimal import Decimal

from pydantic import Field, model_validator

from app.models.enums import GoalMode
from app.schemas.common import Color, Icon, Money, PositiveMoney, Schema

# --- Presupuestos ---


class BudgetIn(Schema):
    category_id: int
    amount: PositiveMoney
    alert_pct: int = Field(default=80, ge=1, le=100)
    # Cualquier día del mes; se guarda como día 1. Por defecto, el mes actual.
    start_month: date | None = None


class BudgetPatch(Schema):
    amount: PositiveMoney | None = None
    alert_pct: int | None = Field(default=None, ge=1, le=100)


class BudgetOverrideIn(Schema):
    month: date
    amount: Money = Field(ge=0)


class BudgetOverrideOut(Schema):
    month: date
    amount: Money


class BudgetOut(Schema):
    id: int
    category_id: int
    amount: Money
    alert_pct: int
    start_month: date
    overrides: list[BudgetOverrideOut]


class BudgetStatusOut(Schema):
    budget_id: int
    category_id: int
    name: str
    icon: str
    color: str
    is_subcategory: bool
    # Límite de este mes (el general o la excepción del mes).
    limit: Money
    base_amount: Money
    is_override: bool
    alert_pct: int
    spent: Money
    # Recurrentes previstos de esta categoría que faltan por pagar este mes.
    committed: Money
    remaining: Money
    pct: Decimal
    # ok · warning (alcanzado el % de aviso) · over (superado)
    status: str
    # Con lo comprometido se superaría el presupuesto.
    will_exceed: bool


class UnbudgetedOut(Schema):
    category_id: int | None
    name: str
    amount: Money


class BudgetMonthOut(Schema):
    month: date
    is_current_month: bool
    # Fracción del mes transcurrida (0-100), para comparar con el ritmo de gasto.
    month_elapsed_pct: Decimal
    items: list[BudgetStatusOut]
    total_limit: Money
    total_spent: Money
    total_committed: Money
    unbudgeted: list[UnbudgetedOut]
    unbudgeted_total: Money


# --- Objetivos de ahorro ---


class GoalIn(Schema):
    name: str = Field(min_length=1, max_length=100)
    target_amount: PositiveMoney
    target_date: date | None = None
    mode: GoalMode
    account_id: int | None = None
    icon: Icon = "piggy-bank"
    color: Color = "#10b981"
    archived: bool = False
    notes: str | None = None

    @model_validator(mode="after")
    def _check(self):
        if self.mode == GoalMode.ACCOUNT and self.account_id is None:
            raise ValueError("Elige la cuenta cuyo saldo marca el progreso del objetivo")
        if self.mode == GoalMode.MANUAL:
            self.account_id = None
        return self


class ContributionIn(Schema):
    date: dt.date
    amount: Money
    notes: str | None = Field(default=None, max_length=200)

    @model_validator(mode="after")
    def _check(self):
        if self.amount == 0:
            raise ValueError("El importe no puede ser cero")
        return self


class ContributionOut(Schema):
    id: int
    date: dt.date
    amount: Money
    notes: str | None


class GoalOut(Schema):
    id: int
    name: str
    target_amount: Money
    target_date: date | None
    mode: GoalMode
    account_id: int | None
    icon: str
    color: str
    archived: bool
    notes: str | None
    created_at: dt.datetime
    current: Money
    remaining: Money
    pct: Decimal
    # completed · overdue (pasó la fecha sin llegar) · on_track · behind · no_date
    status: str
    days_left: int | None
    # Lo que habría que ahorrar al mes desde hoy para llegar a tiempo.
    monthly_needed: Money | None
    # Aportado de media al mes en los últimos 3 meses (solo modo manual).
    monthly_pace: Money | None
    contributions: list[ContributionOut]
