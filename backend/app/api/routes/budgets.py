from datetime import date

from fastapi import APIRouter

from app.api.deps import DB, Today
from app.models import SavingsGoal
from app.schemas.budgets import (
    BudgetIn,
    BudgetMonthOut,
    BudgetOut,
    BudgetOverrideIn,
    BudgetPatch,
    ContributionIn,
    ContributionOut,
    GoalIn,
    GoalOut,
)
from app.services import budgets as svc

router = APIRouter(tags=["budgets"])


@router.get("/budgets", response_model=list[BudgetOut])
def list_budgets(db: DB):
    return svc.list_budgets(db)


@router.get("/budgets/status", response_model=BudgetMonthOut)
def budget_status(db: DB, today: Today, month: date | None = None):
    """Gasto frente a presupuesto de un mes (por defecto el actual)."""
    return svc.budget_month(db, month or today, today)


@router.post("/budgets", response_model=BudgetOut, status_code=201)
def create_budget(data: BudgetIn, db: DB, today: Today):
    return svc.create_budget(db, data, today)


@router.patch("/budgets/{budget_id}", response_model=BudgetOut)
def update_budget(budget_id: int, data: BudgetPatch, db: DB):
    return svc.update_budget(db, budget_id, data)


@router.delete("/budgets/{budget_id}", status_code=204)
def delete_budget(budget_id: int, db: DB):
    svc.delete_budget(db, budget_id)


@router.put("/budgets/{budget_id}/overrides", response_model=BudgetOut)
def set_override(budget_id: int, data: BudgetOverrideIn, db: DB):
    """Importe distinto para un mes concreto."""
    return svc.set_override(db, budget_id, data)


@router.delete("/budgets/{budget_id}/overrides/{month}", response_model=BudgetOut)
def delete_override(budget_id: int, month: date, db: DB):
    return svc.delete_override(db, budget_id, month)


def goal_out(db, goal: SavingsGoal, today: date) -> GoalOut:
    return GoalOut(
        **{f: getattr(goal, f) for f in GoalIn.model_fields},
        id=goal.id,
        created_at=goal.created_at,
        contributions=[ContributionOut.model_validate(c) for c in reversed(goal.contributions)],
        **svc.goal_progress(db, goal, today),
    )


@router.get("/goals", response_model=list[GoalOut])
def list_goals(db: DB, today: Today, include_archived: bool = False):
    return [goal_out(db, g, today) for g in svc.list_goals(db, include_archived)]


@router.post("/goals", response_model=GoalOut, status_code=201)
def create_goal(data: GoalIn, db: DB, today: Today):
    return goal_out(db, svc.create_goal(db, data), today)


@router.put("/goals/{goal_id}", response_model=GoalOut)
def update_goal(goal_id: int, data: GoalIn, db: DB, today: Today):
    return goal_out(db, svc.update_goal(db, goal_id, data), today)


@router.delete("/goals/{goal_id}", status_code=204)
def delete_goal(goal_id: int, db: DB):
    svc.delete_goal(db, goal_id)


@router.post("/goals/{goal_id}/contributions", response_model=GoalOut, status_code=201)
def add_contribution(goal_id: int, data: ContributionIn, db: DB, today: Today):
    return goal_out(db, svc.add_contribution(db, goal_id, data), today)


@router.delete("/goals/{goal_id}/contributions/{contribution_id}", response_model=GoalOut)
def delete_contribution(goal_id: int, contribution_id: int, db: DB, today: Today):
    return goal_out(db, svc.delete_contribution(db, goal_id, contribution_id), today)
