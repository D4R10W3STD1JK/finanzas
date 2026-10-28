import datetime as dt
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.core import Account, Category, Money, TimestampMixin
from app.models.enums import GoalMode, str_enum


class Budget(TimestampMixin, Base):
    """Presupuesto mensual de una categoría de gasto (incluye sus subcategorías).

    El importe es el mismo todos los meses desde `start_month`; los meses especiales
    se ajustan con `BudgetOverride`.
    """

    __tablename__ = "budgets"
    __table_args__ = (
        CheckConstraint("amount > 0", name="amount_positive"),
        CheckConstraint("alert_pct BETWEEN 1 AND 100", name="alert_pct_range"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id", ondelete="CASCADE"), unique=True)
    amount: Mapped[Decimal] = mapped_column(Money)
    # Avisar al gastar este porcentaje del presupuesto.
    alert_pct: Mapped[int] = mapped_column(Integer, default=80)
    # Primer mes en que aplica (día 1).
    start_month: Mapped[date] = mapped_column(Date)

    category: Mapped[Category] = relationship()
    overrides: Mapped[list["BudgetOverride"]] = relationship(
        back_populates="budget", cascade="all, delete-orphan", order_by="BudgetOverride.month"
    )

    def amount_for(self, month: date) -> Decimal:
        for o in self.overrides:
            if o.month == month:
                return o.amount
        return self.amount


class BudgetOverride(Base):
    """Excepción de un mes concreto (p. ej. más ocio en agosto)."""

    __tablename__ = "budget_overrides"
    __table_args__ = (
        UniqueConstraint("budget_id", "month"),
        CheckConstraint("amount >= 0", name="amount_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    budget_id: Mapped[int] = mapped_column(ForeignKey("budgets.id", ondelete="CASCADE"), index=True)
    month: Mapped[date] = mapped_column(Date)
    amount: Mapped[Decimal] = mapped_column(Money)

    budget: Mapped[Budget] = relationship(back_populates="overrides")


class SavingsGoal(TimestampMixin, Base):
    __tablename__ = "savings_goals"
    __table_args__ = (
        CheckConstraint("target_amount > 0", name="target_positive"),
        CheckConstraint("(mode = 'account') = (account_id IS NOT NULL)", name="account_mode"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    target_amount: Mapped[Decimal] = mapped_column(Money)
    target_date: Mapped[date | None] = mapped_column(Date)
    mode: Mapped[GoalMode] = mapped_column(str_enum(GoalMode))
    account_id: Mapped[int | None] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"))
    icon: Mapped[str] = mapped_column(String(50), default="piggy-bank")
    color: Mapped[str] = mapped_column(String(20), default="#10b981")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str | None] = mapped_column(Text)

    account: Mapped[Account | None] = relationship()
    contributions: Mapped[list["GoalContribution"]] = relationship(
        back_populates="goal", cascade="all, delete-orphan", order_by="GoalContribution.date"
    )


class GoalContribution(Base):
    """Aportación (positiva) o retirada (negativa) a un objetivo en modo manual."""

    __tablename__ = "goal_contributions"
    __table_args__ = (CheckConstraint("amount <> 0", name="amount_nonzero"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    goal_id: Mapped[int] = mapped_column(ForeignKey("savings_goals.id", ondelete="CASCADE"), index=True)
    date: Mapped[dt.date] = mapped_column(Date)
    amount: Mapped[Decimal] = mapped_column(Money)
    notes: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    goal: Mapped[SavingsGoal] = relationship(back_populates="contributions")
