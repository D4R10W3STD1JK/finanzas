"""Planificación: previsión de flujo de caja y provisiones para gastos no mensuales.

Previsión: se parte del saldo real de hoy y se aplican, día a día,
- las ocurrencias previstas de los recurrentes (las vencidas sin confirmar, hoy mismo),
- los movimientos ya apuntados con fecha futura,
- opcionalmente, el gasto no recurrente medio de los últimos meses repartido por días.

Provisiones ("hucha virtual", teórica): para cada gasto con periodo de más de un mes se calcula
cuánto debería llevarse apartado hoy para pagar el próximo recibo. La hucha empieza a llenarse
en el último pago o, si es posterior, en la fecha desde la que se sigue la serie en la app:
nunca se supone que se ahorró antes de empezar a usarla.
"""

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.domain.costs import money, monthly_cost
from app.domain.recurrence import Unit, months_per_period, step_of
from app.models import (
    Account,
    AccountType,
    Occurrence,
    OccurrenceStatus,
    RecurringSeries,
    RecurringVersion,
    Transaction,
    TransactionKind,
)
from app.services.balances import account_balances
from app.services.recurring import list_series
from app.services.reports import FLOW_KINDS, ZERO, add_months, estimated_amount, first_activity_month

AVG_DAYS_PER_MONTH = Decimal("30.4375")
DAYS_PER_YEAR = Decimal("365.25")


@dataclass
class Move:
    day: date
    account_id: int
    amount: Decimal  # con signo
    kind: TransactionKind


def _moves(kind, amount, account_id, to_account_id, day) -> list[Move]:
    if kind == TransactionKind.INCOME:
        return [Move(day, account_id, amount, kind)]
    if kind == TransactionKind.EXPENSE:
        return [Move(day, account_id, -amount, kind)]
    if kind == TransactionKind.TRANSFER:
        return [Move(day, account_id, -amount, kind), Move(day, to_account_id, amount, kind)]
    return [Move(day, account_id, amount, kind)]  # ajuste: ya lleva signo


def non_recurring_average(db: Session, today: date, max_months: int = 6) -> dict:
    """Ingresos y gastos mensuales medios que no vienen de recurrentes (meses completos con datos)."""
    month = today.replace(day=1)
    first = first_activity_month(db)
    months = [m for m in (add_months(month, -i) for i in range(1, max_months + 1)) if first and m >= first]
    if not months:
        return {"income": money(ZERO), "expense": money(ZERO), "months": 0}
    income, expense = db.execute(
        select(
            func.coalesce(func.sum(Transaction.amount).filter(Transaction.kind == TransactionKind.INCOME), 0),
            func.coalesce(func.sum(Transaction.amount).filter(Transaction.kind == TransactionKind.EXPENSE), 0),
        ).where(
            Transaction.occurrence_id.is_(None),
            Transaction.kind.in_(FLOW_KINDS),
            Transaction.date >= months[-1],
            Transaction.date < month,
        )
    ).one()
    n = Decimal(len(months))
    return {"income": money(Decimal(income) / n), "expense": money(Decimal(expense) / n), "months": len(months)}


def _account_floor(account: Account) -> Decimal | None:
    """Saldo por debajo del cual avisar: 0 en cuentas normales, el límite en tarjetas de crédito."""
    if account.type == AccountType.CREDIT_CARD:
        return -account.credit_limit if account.credit_limit else None
    return ZERO


def forecast(db: Session, today: date, months: int, include_variable: bool, threshold: Decimal) -> dict:
    end = add_months(today, months)
    accounts = {a.id: a for a in db.scalars(select(Account).where(Account.archived.is_(False)))}
    included = {i for i, a in accounts.items() if a.include_in_total}
    balances = account_balances(db, as_of=today)

    moves: list[Move] = []
    for tx in db.scalars(select(Transaction).where(Transaction.date > today, Transaction.date <= end)):
        moves += _moves(tx.kind, tx.amount, tx.account_id, tx.to_account_id, tx.date)
    occurrences = db.scalars(
        select(Occurrence)
        .where(Occurrence.status == OccurrenceStatus.PLANNED, Occurrence.due_date <= end)
        .options(
            selectinload(Occurrence.series).selectinload(RecurringSeries.versions),
            selectinload(Occurrence.version),
        )
    )
    for occ in occurrences:
        version: RecurringVersion = occ.version or occ.series.version_at(occ.scheduled_date)
        moves += _moves(
            occ.series.kind, occ.expected_amount, version.account_id, version.to_account_id, max(occ.due_date, today)
        )
    by_day: dict[date, list[Move]] = defaultdict(list)
    for m in moves:
        if m.account_id in accounts:
            by_day[m.day].append(m)

    variable = non_recurring_average(db, today)
    daily_income = variable["income"] * 12 / DAYS_PER_YEAR if include_variable else ZERO
    daily_expense = variable["expense"] * 12 / DAYS_PER_YEAR if include_variable else ZERO

    per_account = {i: balances.get(i, ZERO) for i in accounts}
    acc_min = {i: (per_account[i], today) for i in accounts}
    total = sum((per_account[i] for i in included), ZERO)
    start_balance = total
    lowest = (total, today)
    first_below = None
    points = []
    monthly: dict[date, dict] = {}

    day = today
    while day <= end:
        key = day.replace(day=1)
        row = monthly.get(key)
        if row is None:
            row = monthly[key] = {
                "month": key, "start": total, "income": ZERO, "expense": ZERO,
                "transfers": ZERO, "min": None, "min_date": None,
            }
        for m in by_day.get(day, []):
            per_account[m.account_id] += m.amount
            if per_account[m.account_id] < acc_min[m.account_id][0]:
                acc_min[m.account_id] = (per_account[m.account_id], day)
            if m.account_id not in included:
                continue
            total += m.amount
            if m.kind == TransactionKind.INCOME:
                row["income"] += m.amount
            elif m.kind == TransactionKind.EXPENSE:
                row["expense"] -= m.amount
            else:
                row["transfers"] += m.amount
        if day > today and include_variable:
            total += daily_income - daily_expense
            row["income"] += daily_income
            row["expense"] += daily_expense
        if row["min"] is None or total < row["min"]:
            row["min"], row["min_date"] = total, day
        if total < lowest[0]:
            lowest = (total, day)
        if first_below is None and total < threshold:
            first_below = (total, day)
        points.append({"date": day, "balance": money(total)})
        day += timedelta(days=1)

    monthly_rows = []
    for row in monthly.values():
        row_end = row["start"] + row["income"] - row["expense"] + row["transfers"]
        monthly_rows.append({
            **{k: money(v) if isinstance(v, Decimal) else v for k, v in row.items()},
            "end": money(row_end),
            "below_threshold": row["min"] < threshold,
        })

    account_rows = []
    for i, a in sorted(accounts.items(), key=lambda kv: (kv[1].sort_order, kv[1].name)):
        floor = _account_floor(a)
        account_rows.append({
            "account_id": i,
            "name": a.name,
            "type": a.type,
            "include_in_total": a.include_in_total,
            "start": money(balances.get(i, ZERO)),
            "end": money(per_account[i]),
            "min": money(acc_min[i][0]),
            "min_date": acc_min[i][1],
            "floor": floor,
            "below_floor": floor is not None and acc_min[i][0] < floor,
        })

    return {
        "start_date": today,
        "end_date": end,
        "months": months,
        "threshold": threshold,
        "include_variable": include_variable,
        "variable": variable,
        "start_balance": money(start_balance),
        "end_balance": money(total),
        "lowest": {"date": lowest[1], "balance": money(lowest[0])},
        "first_below_threshold": {"date": first_below[1], "balance": money(first_below[0])} if first_below else None,
        "points": points,
        "monthly": monthly_rows,
        "accounts": account_rows,
    }


def provisions(db: Session, today: date) -> dict:
    items = []
    for series in list_series(db):
        if series.kind != TransactionKind.EXPENSE:
            continue
        upcoming = [o for o in series.occurrences if o.status == OccurrenceStatus.PLANNED and o.due_date >= today]
        if not upcoming:
            continue
        version = series.version_at(today)
        period = months_per_period(version.frequency, version.interval, version.unit)
        if period <= 1.01:
            continue  # mensual o más frecuente: no necesita provisión
        nxt = min(upcoming, key=lambda o: o.due_date)
        base, basis, _ = estimated_amount(series, version, today)
        amount = nxt.expected_amount if basis == "fixed" or nxt.is_overridden else money(base)

        earlier = [o.due_date for o in series.occurrences if o.due_date < nxt.due_date]
        if earlier:
            previous = max(earlier)
        else:
            unit, n = step_of(version.frequency, version.interval, version.unit)
            previous = (
                add_months(nxt.scheduled_date, -n)
                if unit == Unit.MONTH
                else nxt.scheduled_date - timedelta(days=n * (7 if unit == Unit.WEEK else 1))
            )
        cycle_start = min(max(previous, series.track_from), today)
        total_days = max((nxt.due_date - cycle_start).days, 1)
        elapsed = min(max((today - cycle_start).days, 0), total_days)
        accumulated = money(amount * elapsed / total_days)
        remaining = amount - accumulated
        days_left = (nxt.due_date - today).days
        months_left = Decimal(days_left) / AVG_DAYS_PER_MONTH
        items.append({
            "series_id": series.id,
            "name": series.name,
            "frequency": version.frequency,
            "interval": version.interval,
            "unit": version.unit,
            "category_id": version.category_id,
            "amount": amount,
            "basis": basis,
            "due_date": nxt.due_date,
            "days_left": days_left,
            "cycle_start": cycle_start,
            "started_late": cycle_start > previous,
            "accumulated": accumulated,
            "remaining": money(remaining),
            "progress": (accumulated * 100 / amount).quantize(Decimal("0.1")) if amount else ZERO,
            "monthly_to_go": money(remaining) if months_left < 1 else money(remaining / months_left),
            "ideal_monthly": monthly_cost(amount, version.frequency, version.interval, version.unit),
        })
    items.sort(key=lambda i: i["due_date"])
    needed = sum((i["amount"] for i in items), ZERO)
    accumulated = sum((i["accumulated"] for i in items), ZERO)
    return {
        "items": items,
        "needed": money(needed),
        "accumulated": money(accumulated),
        "progress": (accumulated * 100 / needed).quantize(Decimal("0.1")) if needed else Decimal("0.0"),
        "monthly_to_go": money(sum((i["monthly_to_go"] for i in items), ZERO)),
        "ideal_monthly": money(sum((i["ideal_monthly"] for i in items), ZERO)),
    }
