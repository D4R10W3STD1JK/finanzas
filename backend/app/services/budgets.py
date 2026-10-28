"""Presupuestos mensuales por categoría y objetivos de ahorro."""

import calendar
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.domain.costs import money
from app.models import (
    Budget,
    BudgetOverride,
    Category,
    CategoryKind,
    GoalContribution,
    GoalMode,
    Occurrence,
    OccurrenceStatus,
    RecurringSeries,
    SavingsGoal,
    Transaction,
    TransactionKind,
)
from app.schemas.budgets import BudgetIn, BudgetOverrideIn, BudgetPatch, ContributionIn, GoalIn
from app.services.balances import account_balance
from app.services.errors import Conflict, Invalid, NotFound
from app.services.refs import check_account
from app.services.reports import ZERO, add_months

AVG_DAYS_PER_MONTH = Decimal("30.4375")


def _pct(part: Decimal, whole: Decimal) -> Decimal:
    if whole <= 0:
        return Decimal("100.0") if part > 0 else Decimal("0.0")
    return (part * 100 / whole).quantize(Decimal("0.1"))


# --- Presupuestos: CRUD ---


def _load_budget(db: Session, budget_id: int) -> Budget:
    budget = db.scalar(select(Budget).where(Budget.id == budget_id).options(selectinload(Budget.overrides)))
    if budget is None:
        raise NotFound("Presupuesto no encontrado")
    return budget


def list_budgets(db: Session) -> list[Budget]:
    return list(db.scalars(select(Budget).options(selectinload(Budget.overrides)).order_by(Budget.id)))


def create_budget(db: Session, data: BudgetIn, today: date) -> Budget:
    category = db.get(Category, data.category_id)
    if category is None:
        raise Invalid("La categoría no existe")
    if category.kind != CategoryKind.EXPENSE:
        raise Invalid("Solo se pueden presupuestar categorías de gasto")
    if db.scalar(select(Budget.id).where(Budget.category_id == category.id)):
        raise Conflict(f"Ya hay un presupuesto para «{category.name}»")
    budget = Budget(
        category_id=category.id,
        amount=data.amount,
        alert_pct=data.alert_pct,
        start_month=(data.start_month or today).replace(day=1),
    )
    db.add(budget)
    db.commit()
    return _load_budget(db, budget.id)


def update_budget(db: Session, budget_id: int, data: BudgetPatch) -> Budget:
    budget = _load_budget(db, budget_id)
    if data.amount is not None:
        budget.amount = data.amount
    if data.alert_pct is not None:
        budget.alert_pct = data.alert_pct
    db.commit()
    return _load_budget(db, budget_id)


def delete_budget(db: Session, budget_id: int) -> None:
    db.delete(_load_budget(db, budget_id))
    db.commit()


def set_override(db: Session, budget_id: int, data: BudgetOverrideIn) -> Budget:
    budget = _load_budget(db, budget_id)
    month = data.month.replace(day=1)
    existing = next((o for o in budget.overrides if o.month == month), None)
    if existing:
        existing.amount = data.amount
    else:
        budget.overrides.append(BudgetOverride(month=month, amount=data.amount))
    db.commit()
    return _load_budget(db, budget_id)


def delete_override(db: Session, budget_id: int, month: date) -> Budget:
    budget = _load_budget(db, budget_id)
    month = month.replace(day=1)
    budget.overrides = [o for o in budget.overrides if o.month != month]
    db.commit()
    return _load_budget(db, budget_id)


# --- Presupuestos: estado de un mes ---


def budget_month(db: Session, month: date, today: date) -> dict:
    month = month.replace(day=1)
    next_month = add_months(month, 1)
    categories = {c.id: c for c in db.scalars(select(Category))}
    children: dict[int, set[int]] = {}
    for c in categories.values():
        if c.parent_id:
            children.setdefault(c.parent_id, set()).add(c.id)

    spent = dict(
        db.execute(
            select(Transaction.category_id, func.sum(Transaction.amount))
            .where(
                Transaction.kind == TransactionKind.EXPENSE,
                Transaction.date >= month,
                Transaction.date < next_month,
            )
            .group_by(Transaction.category_id)
        ).all()
    )

    # Lo previsto y aún no pagado este mes (incluye lo vencido sin confirmar).
    committed: dict[int | None, Decimal] = {}
    occurrences = db.scalars(
        select(Occurrence)
        .join(RecurringSeries)
        .where(
            RecurringSeries.kind == TransactionKind.EXPENSE,
            Occurrence.status == OccurrenceStatus.PLANNED,
            Occurrence.due_date >= month,
            Occurrence.due_date < next_month,
        )
        .options(selectinload(Occurrence.version), selectinload(Occurrence.series).selectinload(RecurringSeries.versions))
    )
    for occ in occurrences:
        version = occ.version or occ.series.version_at(occ.scheduled_date)
        committed[version.category_id] = committed.get(version.category_id, ZERO) + occ.expected_amount

    budgets = [b for b in list_budgets(db) if b.start_month <= month]
    budgeted_ids = {b.category_id for b in budgets}
    covered: set[int] = set()
    items = []
    total_limit = total_spent = total_committed = ZERO
    for b in budgets:
        cat = categories[b.category_id]
        ids = {cat.id} | (children.get(cat.id, set()) if cat.parent_id is None else set())
        covered |= ids
        b_spent = sum((Decimal(spent.get(i) or 0) for i in ids), ZERO)
        b_committed = sum((committed.get(i, ZERO) for i in ids), ZERO)
        limit = b.amount_for(month)
        pct = _pct(b_spent, limit)
        status = "over" if b_spent > limit else "warning" if pct >= b.alert_pct else "ok"
        items.append({
            "budget_id": b.id,
            "category_id": cat.id,
            "name": f"{categories[cat.parent_id].name} › {cat.name}" if cat.parent_id else cat.name,
            "icon": cat.icon,
            "color": cat.color,
            "is_subcategory": cat.parent_id is not None,
            "limit": money(limit),
            "base_amount": b.amount,
            "is_override": limit != b.amount or any(o.month == month for o in b.overrides),
            "alert_pct": b.alert_pct,
            "spent": money(b_spent),
            "committed": money(b_committed),
            "remaining": money(limit - b_spent),
            "pct": pct,
            "status": status,
            "will_exceed": b_spent + b_committed > limit,
        })
        # Para los totales no se cuenta dos veces una subcategoría cuya categoría padre también tiene presupuesto.
        if not (cat.parent_id and cat.parent_id in budgeted_ids):
            total_limit += limit
            total_spent += b_spent
            total_committed += b_committed

    order = {"over": 0, "warning": 1, "ok": 2}
    items.sort(key=lambda i: (order[i["status"]], -i["pct"]))

    unbudgeted: dict[int | None, dict] = {}
    for cat_id, amount in spent.items():
        if cat_id in covered:
            continue
        cat = categories.get(cat_id)
        top = categories[cat.parent_id] if cat and cat.parent_id else cat
        key = top.id if top else None
        row = unbudgeted.setdefault(key, {"category_id": key, "name": top.name if top else "Sin categoría", "amount": ZERO})
        row["amount"] += Decimal(amount)
    unbudgeted_rows = sorted(unbudgeted.values(), key=lambda r: r["amount"], reverse=True)

    days = calendar.monthrange(month.year, month.month)[1]
    if month == today.replace(day=1):
        elapsed = Decimal(today.day * 100) / days
    else:
        elapsed = Decimal(100) if month < today else ZERO

    return {
        "month": month,
        "is_current_month": month == today.replace(day=1),
        "month_elapsed_pct": elapsed.quantize(Decimal("0.1")),
        "items": items,
        "total_limit": money(total_limit),
        "total_spent": money(total_spent),
        "total_committed": money(total_committed),
        "unbudgeted": [{**r, "amount": money(r["amount"])} for r in unbudgeted_rows],
        "unbudgeted_total": money(sum((r["amount"] for r in unbudgeted_rows), ZERO)),
    }


# --- Objetivos de ahorro ---


def _load_goal(db: Session, goal_id: int) -> SavingsGoal:
    goal = db.scalar(
        select(SavingsGoal).where(SavingsGoal.id == goal_id).options(selectinload(SavingsGoal.contributions))
    )
    if goal is None:
        raise NotFound("Objetivo no encontrado")
    return goal


def list_goals(db: Session, include_archived: bool = False) -> list[SavingsGoal]:
    stmt = select(SavingsGoal).options(selectinload(SavingsGoal.contributions)).order_by(SavingsGoal.id)
    if not include_archived:
        stmt = stmt.where(SavingsGoal.archived.is_(False))
    return list(db.scalars(stmt))


def _apply_goal(db: Session, goal: SavingsGoal, data: GoalIn) -> None:
    if data.mode == GoalMode.ACCOUNT:
        check_account(db, data.account_id)
    for field, value in data.model_dump().items():
        setattr(goal, field, value)
    goal.name = goal.name.strip()


def create_goal(db: Session, data: GoalIn) -> SavingsGoal:
    goal = SavingsGoal()
    _apply_goal(db, goal, data)
    db.add(goal)
    db.commit()
    return _load_goal(db, goal.id)


def update_goal(db: Session, goal_id: int, data: GoalIn) -> SavingsGoal:
    goal = _load_goal(db, goal_id)
    _apply_goal(db, goal, data)
    db.commit()
    return _load_goal(db, goal_id)


def delete_goal(db: Session, goal_id: int) -> None:
    db.delete(_load_goal(db, goal_id))
    db.commit()


def add_contribution(db: Session, goal_id: int, data: ContributionIn) -> SavingsGoal:
    goal = _load_goal(db, goal_id)
    if goal.mode != GoalMode.MANUAL:
        raise Invalid("Este objetivo sigue el saldo de una cuenta: el progreso cambia con los movimientos de esa cuenta")
    goal.contributions.append(GoalContribution(date=data.date, amount=data.amount, notes=data.notes))
    db.commit()
    return _load_goal(db, goal_id)


def delete_contribution(db: Session, goal_id: int, contribution_id: int) -> SavingsGoal:
    goal = _load_goal(db, goal_id)
    contribution = next((c for c in goal.contributions if c.id == contribution_id), None)
    if contribution is None:
        raise NotFound("Aportación no encontrada")
    goal.contributions.remove(contribution)
    db.commit()
    return _load_goal(db, goal_id)


def goal_progress(db: Session, goal: SavingsGoal, today: date) -> dict:
    three_months_ago = today - timedelta(days=91)
    if goal.mode == GoalMode.ACCOUNT:
        current = account_balance(db, goal.account_id, as_of=today)
        before = account_balance(db, goal.account_id, as_of=three_months_ago)
        pace = (current - before) / 3
    else:
        current = sum((c.amount for c in goal.contributions if c.date <= today), ZERO)
        pace = sum((c.amount for c in goal.contributions if three_months_ago < c.date <= today), ZERO) / 3

    target = goal.target_amount
    remaining = max(target - current, ZERO)
    days_left = (goal.target_date - today).days if goal.target_date else None
    monthly_needed = None
    if current >= target:
        status = "completed"
    elif goal.target_date is None:
        status = "no_date"
    elif days_left < 0:
        status = "overdue"
    else:
        months_left = Decimal(days_left) / AVG_DAYS_PER_MONTH
        monthly_needed = money(remaining if months_left < 1 else remaining / months_left)
        # Ritmo lineal desde que se creó el objetivo hasta la fecha meta.
        start = goal.created_at.date() if goal.created_at else today
        total_days = max((goal.target_date - start).days, 1)
        expected = target * min(max((today - start).days, 0), total_days) / total_days
        status = "on_track" if current >= expected else "behind"

    return {
        "current": money(current),
        "remaining": money(remaining),
        "pct": _pct(max(current, ZERO), target),
        "status": status,
        "days_left": days_left,
        "monthly_needed": monthly_needed,
        "monthly_pace": money(pace),
    }
