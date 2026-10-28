from fastapi import APIRouter
from sqlalchemy import exists, or_, select

from app.api.deps import DB, Today
from app.models import Account, RecurringVersion, Transaction
from app.schemas.core import AccountIn, AccountOut, AccountPatch, ReconcileIn, TransactionOut
from app.services.balances import account_balances
from app.services.errors import Conflict, get_or_404
from app.services.transactions import create_adjustment

router = APIRouter(prefix="/accounts", tags=["accounts"])


def _out(account: Account, balance) -> AccountOut:
    fields = {f: getattr(account, f) for f in AccountOut.model_fields if f != "balance"}
    return AccountOut(**fields, balance=balance)


@router.get("", response_model=list[AccountOut])
def list_accounts(db: DB, today: Today, include_archived: bool = False):
    stmt = select(Account).order_by(Account.sort_order, Account.name)
    if not include_archived:
        stmt = stmt.where(Account.archived.is_(False))
    balances = account_balances(db, as_of=today)
    return [_out(a, balances[a.id]) for a in db.scalars(stmt)]


@router.get("/{account_id}", response_model=AccountOut)
def get_account(account_id: int, db: DB, today: Today):
    account = get_or_404(db, Account, account_id, "Cuenta no encontrada")
    return _out(account, account_balances(db, as_of=today)[account.id])


@router.post("", response_model=AccountOut, status_code=201)
def create_account(data: AccountIn, db: DB, today: Today):
    account = Account(**data.model_dump())
    account.name = account.name.strip()
    db.add(account)
    db.commit()
    return _out(account, account_balances(db, as_of=today)[account.id])


@router.patch("/{account_id}", response_model=AccountOut)
def update_account(account_id: int, data: AccountPatch, db: DB, today: Today):
    account = get_or_404(db, Account, account_id, "Cuenta no encontrada")
    for field in data.model_fields_set:
        value = getattr(data, field)
        if value is None and field not in ("credit_limit", "notes"):
            continue
        setattr(account, field, value)
    db.commit()
    return _out(account, account_balances(db, as_of=today)[account.id])


@router.delete("/{account_id}", status_code=204)
def delete_account(account_id: int, db: DB):
    account = get_or_404(db, Account, account_id, "Cuenta no encontrada")
    used = db.scalar(
        select(
            exists().where(or_(Transaction.account_id == account_id, Transaction.to_account_id == account_id))
        )
    ) or db.scalar(
        select(
            exists().where(
                or_(RecurringVersion.account_id == account_id, RecurringVersion.to_account_id == account_id)
            )
        )
    )
    if used:
        raise Conflict("La cuenta tiene movimientos o recurrentes. Puedes archivarla en lugar de borrarla.")
    db.delete(account)
    db.commit()


@router.post("/{account_id}/reconcile", response_model=TransactionOut | None)
def reconcile(account_id: int, data: ReconcileIn, db: DB):
    """Ajusta el saldo calculado al saldo real creando un movimiento de ajuste por la diferencia."""
    get_or_404(db, Account, account_id, "Cuenta no encontrada")
    tx = create_adjustment(db, account_id, data.real_balance, data.date, data.notes)
    if tx is None:
        return None
    return TransactionOut.model_validate(tx)
