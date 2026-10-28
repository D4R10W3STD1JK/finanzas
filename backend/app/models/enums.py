from enum import StrEnum

from sqlalchemy import Enum

from app.domain.recurrence import BusinessDayAdjust, Frequency, Unit

__all__ = [
    "AccountType",
    "AmountMode",
    "BusinessDayAdjust",
    "CategoryKind",
    "Frequency",
    "GoalMode",
    "OccurrenceStatus",
    "TransactionKind",
    "Unit",
    "str_enum",
]


class AccountType(StrEnum):
    BANK = "bank"
    CASH = "cash"
    CREDIT_CARD = "credit_card"
    SAVINGS = "savings"
    INVESTMENT = "investment"


class CategoryKind(StrEnum):
    INCOME = "income"
    EXPENSE = "expense"


class TransactionKind(StrEnum):
    INCOME = "income"
    EXPENSE = "expense"
    TRANSFER = "transfer"
    # Ajuste de conciliación: importe con signo, no cuenta como ingreso ni gasto.
    ADJUSTMENT = "adjustment"


class AmountMode(StrEnum):
    FIXED = "fixed"
    VARIABLE = "variable"


class OccurrenceStatus(StrEnum):
    PLANNED = "planned"
    CONFIRMED = "confirmed"
    SKIPPED = "skipped"


class GoalMode(StrEnum):
    # El progreso es el saldo de una cuenta (p. ej. una cuenta de ahorro dedicada).
    ACCOUNT = "account"
    # El progreso es la suma de las aportaciones apuntadas a mano.
    MANUAL = "manual"


def str_enum(enum_cls: type[StrEnum]) -> Enum:
    """Enum guardado como VARCHAR + CHECK: más fácil de migrar que un ENUM nativo de Postgres."""
    return Enum(
        enum_cls,
        native_enum=False,
        create_constraint=True,
        length=20,
        values_callable=lambda e: [m.value for m in e],
        name=enum_cls.__name__.lower(),
    )
