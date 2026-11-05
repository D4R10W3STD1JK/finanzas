"""Informes: dashboard mensual y coste equivalente de los recurrentes.

Las transferencias y los ajustes de saldo no cuentan como ingreso ni gasto en ningún informe.
"""

from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import Date, cast, func, select
from sqlalchemy.orm import Session

from app.domain.costs import annual_cost, money, monthly_cost
from app.domain.recurrence import clamp_day
from app.models import (
    Account,
    AmountMode,
    Category,
    Occurrence,
    OccurrenceStatus,
    RecurringSeries,
    Transaction,
    TransactionKind,
)
from app.services.balances import account_balances
from app.services.recurring import list_series

ZERO = Decimal("0")
FLOW_KINDS = (TransactionKind.INCOME, TransactionKind.EXPENSE)


def add_months(d: date, n: int) -> date:
    total = d.year * 12 + d.month - 1 + n
    return clamp_day(total // 12, total % 12 + 1, d.day)


def savings_rate(income: Decimal, expense: Decimal) -> Decimal | None:
    """Porcentaje de los ingresos que no se gasta (con un decimal). None si no hubo ingresos."""
    if income <= 0:
        return None
    return ((income - expense) * 100 / income).quantize(Decimal("0.1"))


@dataclass
class Flow:
    income: Decimal = ZERO
    expense: Decimal = ZERO

    @property
    def savings(self) -> Decimal:
        return self.income - self.expense


def monthly_flows(db: Session, start: date, end: date) -> dict[date, Flow]:
    """Ingresos y gastos por mes (clave: día 1 del mes) en [start, end)."""
    month = cast(func.date_trunc("month", Transaction.date), Date)
    rows = db.execute(
        select(
            month,
            func.coalesce(func.sum(Transaction.amount).filter(Transaction.kind == TransactionKind.INCOME), 0),
            func.coalesce(func.sum(Transaction.amount).filter(Transaction.kind == TransactionKind.EXPENSE), 0),
        )
        .where(Transaction.date >= start, Transaction.date < end, Transaction.kind.in_(FLOW_KINDS))
        .group_by(month)
    ).all()
    return {m: Flow(Decimal(i), Decimal(e)) for m, i, e in rows}


def first_activity_month(db: Session) -> date | None:
    first = db.scalar(select(func.min(Transaction.date)).where(Transaction.kind.in_(FLOW_KINDS)))
    return first.replace(day=1) if first else None


def expenses_by_category(db: Session, start: date, end: date) -> list[dict]:
    """Gastos del periodo agrupados por categoría principal, con el desglose por subcategoría."""
    rows = db.execute(
        select(Transaction.category_id, func.sum(Transaction.amount))
        .where(Transaction.date >= start, Transaction.date < end, Transaction.kind == TransactionKind.EXPENSE)
        .group_by(Transaction.category_id)
    ).all()
    categories = {c.id: c for c in db.scalars(select(Category))}
    total = sum((Decimal(a) for _, a in rows), ZERO)
    groups: dict[int | None, dict] = {}
    for cat_id, amount in rows:
        cat = categories.get(cat_id)
        top = categories[cat.parent_id] if cat and cat.parent_id else cat
        key = top.id if top else None
        group = groups.setdefault(
            key,
            {
                "category_id": key,
                "name": top.name if top else "Sin categoría",
                "icon": top.icon if top else "ellipsis",
                "color": top.color if top else "#94a3b8",
                "amount": ZERO,
                "children": [],
            },
        )
        group["amount"] += Decimal(amount)
        if cat and cat.parent_id:
            group["children"].append({"category_id": cat.id, "name": cat.name, "amount": Decimal(amount)})
        elif cat:
            group["children"].append({"category_id": cat.id, "name": f"{cat.name} (general)", "amount": Decimal(amount)})
    result = sorted(groups.values(), key=lambda g: g["amount"], reverse=True)
    for g in result:
        g["share"] = (g["amount"] * 100 / total).quantize(Decimal("0.1")) if total else ZERO
        g["children"].sort(key=lambda c: c["amount"], reverse=True)
        if len(g["children"]) == 1 and g["children"][0]["category_id"] == g["category_id"]:
            g["children"] = []
    return result


def _flow_out(flow: Flow | None) -> dict | None:
    if flow is None:
        return None
    return {
        "income": money(flow.income),
        "expense": money(flow.expense),
        "savings": money(flow.savings),
        "savings_rate": savings_rate(flow.income, flow.expense),
    }


def dashboard(db: Session, month: date, today: date) -> dict:
    month = month.replace(day=1)
    window_start = add_months(month, -12)
    flows = monthly_flows(db, window_start, add_months(month, 1))
    first = first_activity_month(db)

    current = flows.get(month, Flow())
    previous_month = add_months(month, -1)
    previous = flows.get(previous_month, Flow()) if first and previous_month >= first else None

    # Media de los 12 meses anteriores, contando solo desde que hay datos.
    prior = [add_months(month, -i) for i in range(1, 13)]
    prior = [m for m in prior if first and m >= first]
    average = None
    if prior:
        n = Decimal(len(prior))
        average = Flow(
            sum((flows.get(m, Flow()).income for m in prior), ZERO) / n,
            sum((flows.get(m, Flow()).expense for m in prior), ZERO) / n,
        )

    months = [add_months(month, -i) for i in range(11, -1, -1)]
    evolution = []
    year = Flow()
    for m in months:
        f = flows.get(m, Flow())
        has_data = bool(first and m >= first)
        evolution.append({"month": m, **_flow_out(f), "has_data": has_data})
        if has_data:
            year.income += f.income
            year.expense += f.expense

    upcoming_to = today + timedelta(days=30)
    upcoming = db.execute(
        select(Occurrence.series_id, Occurrence.expected_amount, Occurrence.due_date)
        .where(
            Occurrence.status == OccurrenceStatus.PLANNED,
            Occurrence.due_date >= today,
            Occurrence.due_date <= upcoming_to,
        )
    ).all()
    kinds = dict(db.execute(select(RecurringSeries.id, RecurringSeries.kind)).all())
    up_income = sum((a for s, a, _ in upcoming if kinds[s] == TransactionKind.INCOME), ZERO)
    up_expense = sum((a for s, a, _ in upcoming if kinds[s] == TransactionKind.EXPENSE), ZERO)
    pending = db.scalar(
        select(func.count()).select_from(Occurrence).where(
            Occurrence.status == OccurrenceStatus.PLANNED, Occurrence.due_date < today
        )
    )

    included = list(
        db.scalars(select(Account.id).where(Account.include_in_total.is_(True), Account.archived.is_(False)))
    )
    balances = account_balances(db, as_of=today)
    balance_history = _balance_history(db, months, included, first, today)

    return {
        "month": month,
        "is_current_month": month == today.replace(day=1),
        "total_balance": money(sum((balances[i] for i in included), ZERO)),
        "current": _flow_out(current),
        "previous": _flow_out(previous),
        "average": _flow_out(average),
        "average_months": len(prior),
        "last_12_months": _flow_out(year),
        "expenses_by_category": expenses_by_category(db, month, add_months(month, 1)),
        "evolution": evolution,
        "balance_history": balance_history,
        "upcoming": {"income": money(up_income), "expense": money(up_expense), "count": len(upcoming)},
        "pending_count": pending,
    }


def _balance_history(
    db: Session, months: list[date], included: list[int], first: date | None, today: date
) -> list[dict]:
    """Saldo total al cierre de cada mes (o a hoy en el mes en curso); None en los meses aún por llegar."""
    out = []
    for m in months:
        as_of = min(add_months(m, 1) - timedelta(days=1), today)
        balance = None
        if m <= today:
            balances = account_balances(db, as_of=as_of)
            balance = money(sum((balances[i] for i in included), ZERO))
        out.append({"month": m, "balance": balance, "has_data": bool(first and m >= first)})
    return out


# --- Coste mensual equivalente ---


def estimated_amount(series: RecurringSeries, version, today: date) -> tuple[Decimal, str, list[Decimal]]:
    """Importe representativo de un recurrente y en qué se basa.

    fixed: importe fijo · average: media real de los últimos 12 meses (variables) · estimate: estimado.
    Devuelve también los importes reales confirmados en los últimos 12 meses.
    """
    year_ago = today - timedelta(days=365)
    recent = [
        o.transaction.amount
        for o in series.occurrences
        if o.status == OccurrenceStatus.CONFIRMED and o.transaction and o.transaction.date > year_ago
    ]
    if version.amount_mode != AmountMode.VARIABLE:
        return version.amount, "fixed", recent
    if recent:
        return sum(recent, ZERO) / len(recent), "average", recent
    return version.amount, "estimate", recent


def recurring_costs(db: Session, today: date) -> dict:
    items = []
    for series in list_series(db):
        planned = [o for o in series.occurrences if o.status == OccurrenceStatus.PLANNED]
        if (series.end_date and series.end_date < today) or not planned:
            continue  # serie terminada
        version = series.version_at(today)
        base, basis, recent = estimated_amount(series, version, today)
        upcoming = [o for o in planned if o.due_date >= today]
        nxt = min(upcoming, key=lambda o: o.due_date) if upcoming else None
        items.append(
            {
                "series_id": series.id,
                "name": series.name,
                "kind": series.kind,
                "is_subscription": series.is_subscription,
                "frequency": version.frequency,
                "interval": version.interval,
                "unit": version.unit,
                "day_of_month": version.day_of_month,
                "amount": version.amount,
                "amount_mode": version.amount_mode,
                "basis": basis,
                "base_amount": money(base),
                "monthly": monthly_cost(base, version.frequency, version.interval, version.unit),
                "annual": annual_cost(base, version.frequency, version.interval, version.unit),
                "category_id": version.category_id,
                "account_id": version.account_id,
                "next_due_date": nxt.due_date if nxt else None,
                "next_amount": nxt.expected_amount if nxt else None,
                "last_12m_total": money(sum(recent, ZERO)),
                "last_12m_count": len(recent),
            }
        )
    items.sort(key=lambda i: i["monthly"], reverse=True)

    def total(kind, subscriptions_only=False):
        sel = [i for i in items if i["kind"] == kind and (i["is_subscription"] or not subscriptions_only)]
        return {
            "monthly": money(sum((i["monthly"] for i in sel), ZERO)),
            "annual": money(sum((i["annual"] for i in sel), ZERO)),
            "count": len(sel),
        }

    income = total(TransactionKind.INCOME)
    expense = total(TransactionKind.EXPENSE)
    return {
        "items": items,
        "income": income,
        "expense": expense,
        "transfer": total(TransactionKind.TRANSFER),
        "subscriptions": total(TransactionKind.EXPENSE, subscriptions_only=True),
        "net_monthly": money(income["monthly"] - expense["monthly"]),
    }
