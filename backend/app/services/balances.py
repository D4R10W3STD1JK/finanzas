from datetime import date
from decimal import Decimal

from sqlalchemy import case, func, select, union_all
from sqlalchemy.orm import Session

from app.models import Account, Transaction, TransactionKind


def _signed_flows(as_of: date | None):
    """Una fila por movimiento y cuenta afectada con su importe con signo."""
    outgoing = case(
        (Transaction.kind.in_([TransactionKind.EXPENSE, TransactionKind.TRANSFER]), -Transaction.amount),
        else_=Transaction.amount,  # ingresos y ajustes (los ajustes ya llevan signo)
    )
    origin = select(Transaction.account_id.label("account_id"), outgoing.label("amount"))
    destination = select(
        Transaction.to_account_id.label("account_id"), Transaction.amount.label("amount")
    ).where(Transaction.kind == TransactionKind.TRANSFER)
    if as_of is not None:
        origin = origin.where(Transaction.date <= as_of)
        destination = destination.where(Transaction.date <= as_of)
    return union_all(origin, destination).subquery()


def account_balances(db: Session, as_of: date | None = None) -> dict[int, Decimal]:
    """Saldo de todas las cuentas: saldo inicial + movimientos hasta ``as_of`` (incluido)."""
    flows = _signed_flows(as_of)
    totals = dict(
        db.execute(select(flows.c.account_id, func.sum(flows.c.amount)).group_by(flows.c.account_id)).all()
    )
    return {
        acc_id: initial + (totals.get(acc_id) or Decimal("0"))
        for acc_id, initial in db.execute(select(Account.id, Account.initial_balance)).all()
    }


def account_balance(db: Session, account_id: int, as_of: date | None = None) -> Decimal:
    return account_balances(db, as_of).get(account_id, Decimal("0"))
