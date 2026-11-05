from datetime import date
from decimal import Decimal

from app.models.enums import AmountMode, Frequency, TransactionKind, Unit
from app.schemas.common import Money, Schema


class FlowOut(Schema):
    income: Money
    expense: Money
    savings: Money
    # Porcentaje de ingresos ahorrado; None si no hubo ingresos.
    savings_rate: Decimal | None


class MonthFlowOut(FlowOut):
    month: date
    # False para meses anteriores al primer movimiento registrado.
    has_data: bool


class CategoryChildOut(Schema):
    category_id: int
    name: str
    amount: Money


class CategoryExpenseOut(Schema):
    category_id: int | None
    name: str
    icon: str
    color: str
    amount: Money
    share: Decimal
    children: list[CategoryChildOut]


class UpcomingOut(Schema):
    income: Money
    expense: Money
    count: int


class BalancePointOut(Schema):
    month: date
    # Saldo total al cierre del mes (hoy en el mes en curso); None si el mes aún no ha empezado.
    balance: Money | None
    has_data: bool


class DashboardOut(Schema):
    month: date
    is_current_month: bool
    total_balance: Money
    current: FlowOut
    previous: FlowOut | None
    average: FlowOut | None
    average_months: int
    last_12_months: FlowOut
    expenses_by_category: list[CategoryExpenseOut]
    evolution: list[MonthFlowOut]
    balance_history: list[BalancePointOut]
    upcoming: UpcomingOut
    pending_count: int


class RecurringCostOut(Schema):
    series_id: int
    name: str
    kind: TransactionKind
    is_subscription: bool
    frequency: Frequency
    interval: int
    unit: Unit | None
    day_of_month: int | None
    amount: Money
    amount_mode: AmountMode
    # fixed: importe fijo · average: media real de los últimos 12 meses · estimate: estimado
    basis: str
    base_amount: Money
    monthly: Money
    annual: Money
    category_id: int | None
    account_id: int
    next_due_date: date | None
    next_amount: Money | None
    last_12m_total: Money
    last_12m_count: int


class CostTotalOut(Schema):
    monthly: Money
    annual: Money
    count: int


class RecurringCostsOut(Schema):
    items: list[RecurringCostOut]
    income: CostTotalOut
    expense: CostTotalOut
    transfer: CostTotalOut
    subscriptions: CostTotalOut
    net_monthly: Money


# --- Previsión de flujo de caja ---


class BalancePoint(Schema):
    date: date
    balance: Money


class VariableAverageOut(Schema):
    income: Money
    expense: Money
    months: int


class ForecastMonthOut(Schema):
    month: date
    start: Money
    income: Money
    expense: Money
    transfers: Money
    end: Money
    min: Money
    min_date: date
    below_threshold: bool


class ForecastAccountOut(Schema):
    account_id: int
    name: str
    type: str
    include_in_total: bool
    start: Money
    end: Money
    min: Money
    min_date: date
    floor: Money | None
    below_floor: bool


class ForecastOut(Schema):
    start_date: date
    end_date: date
    months: int
    threshold: Money
    include_variable: bool
    variable: VariableAverageOut
    start_balance: Money
    end_balance: Money
    lowest: BalancePoint
    first_below_threshold: BalancePoint | None
    points: list[BalancePoint]
    monthly: list[ForecastMonthOut]
    accounts: list[ForecastAccountOut]


# --- Provisiones ---


class ProvisionOut(Schema):
    series_id: int
    name: str
    frequency: Frequency
    interval: int
    unit: Unit | None
    category_id: int | None
    amount: Money
    basis: str
    due_date: date
    days_left: int
    cycle_start: date
    # La serie se empezó a seguir a mitad de ciclo: la hucha arranca en 0 y la cuota es mayor.
    started_late: bool
    accumulated: Money
    remaining: Money
    progress: Decimal
    monthly_to_go: Money
    ideal_monthly: Money


class ProvisionsOut(Schema):
    items: list[ProvisionOut]
    needed: Money
    accumulated: Money
    progress: Decimal
    monthly_to_go: Money
    ideal_monthly: Money
