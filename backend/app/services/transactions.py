from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.models import (
    Category,
    Occurrence,
    OccurrenceStatus,
    Transaction,
    TransactionKind,
    transaction_tags,
)
from app.schemas.core import TransactionIn
from app.services import attachments
from app.services.balances import account_balance
from app.services.errors import Invalid, NotFound
from app.services.refs import check_account, check_category, check_transfer_accounts, load_tags


def _apply(db: Session, tx: Transaction, data: TransactionIn) -> None:
    check_transfer_accounts(db, data.kind, data.account_id, data.to_account_id)
    check_category(db, data.category_id, data.kind)
    tx.kind = data.kind
    tx.amount = data.amount
    tx.date = data.date
    tx.concept = data.concept.strip()
    tx.category_id = data.category_id
    tx.account_id = data.account_id
    tx.to_account_id = data.to_account_id
    tx.notes = data.notes
    tx.is_deductible = data.is_deductible
    tx.tags = load_tags(db, data.tag_ids)


def get_transaction(db: Session, tx_id: int) -> Transaction:
    tx = db.scalar(
        select(Transaction)
        .where(Transaction.id == tx_id)
        .options(
            selectinload(Transaction.tags),
            selectinload(Transaction.attachments),
            selectinload(Transaction.occurrence),
        )
    )
    if tx is None:
        raise NotFound("Movimiento no encontrado")
    return tx


def create_transaction(db: Session, data: TransactionIn) -> Transaction:
    tx = Transaction()
    _apply(db, tx, data)
    db.add(tx)
    db.commit()
    return get_transaction(db, tx.id)


def update_transaction(db: Session, tx_id: int, data: TransactionIn) -> Transaction:
    tx = get_transaction(db, tx_id)
    if tx.kind == TransactionKind.ADJUSTMENT:
        raise Invalid("Los ajustes de saldo no se editan; bórralo y vuelve a conciliar")
    _apply(db, tx, data)
    db.commit()
    return get_transaction(db, tx.id)


def delete_transaction(db: Session, tx_id: int) -> None:
    tx = get_transaction(db, tx_id)
    files = list(tx.attachments)
    if tx.occurrence is not None:
        # La ocurrencia vuelve a "prevista", marcada como manual para que no se reconfirme sola.
        tx.occurrence.status = OccurrenceStatus.PLANNED
        tx.occurrence.is_overridden = True
    db.delete(tx)
    db.commit()
    attachments.delete_files(files)


def create_adjustment(db: Session, account_id: int, real_balance: Decimal, on: date, notes: str | None):
    """Conciliación: crea un ajuste por la diferencia entre el saldo real y el calculado."""
    check_account(db, account_id)
    diff = real_balance - account_balance(db, account_id, as_of=on)
    if diff == 0:
        return None
    tx = Transaction(
        kind=TransactionKind.ADJUSTMENT,
        amount=diff,
        date=on,
        concept="Ajuste de saldo",
        account_id=account_id,
        notes=notes,
    )
    db.add(tx)
    db.commit()
    return get_transaction(db, tx.id)


@dataclass
class TransactionFilters:
    date_from: date | None = None
    date_to: date | None = None
    account_id: int | None = None
    category_id: int | None = None  # incluye sus subcategorías
    uncategorized: bool = False
    kind: TransactionKind | None = None
    tag_id: int | None = None
    q: str | None = None
    min_amount: Decimal | None = None
    max_amount: Decimal | None = None


def _filtered(db: Session, f: TransactionFilters) -> Select:
    stmt = select(Transaction)
    if f.date_from:
        stmt = stmt.where(Transaction.date >= f.date_from)
    if f.date_to:
        stmt = stmt.where(Transaction.date <= f.date_to)
    if f.account_id:
        stmt = stmt.where(
            or_(Transaction.account_id == f.account_id, Transaction.to_account_id == f.account_id)
        )
    if f.category_id:
        sub_ids = select(Category.id).where(Category.parent_id == f.category_id)
        stmt = stmt.where(
            or_(Transaction.category_id == f.category_id, Transaction.category_id.in_(sub_ids))
        )
    if f.uncategorized:
        stmt = stmt.where(
            Transaction.category_id.is_(None),
            Transaction.kind.in_([TransactionKind.INCOME, TransactionKind.EXPENSE]),
        )
    if f.kind:
        stmt = stmt.where(Transaction.kind == f.kind)
    if f.tag_id:
        tagged = select(transaction_tags.c.transaction_id).where(transaction_tags.c.tag_id == f.tag_id)
        stmt = stmt.where(Transaction.id.in_(tagged))
    if f.q:
        pattern = f"%{f.q.strip()}%"
        stmt = stmt.where(or_(Transaction.concept.ilike(pattern), Transaction.notes.ilike(pattern)))
    if f.min_amount is not None:
        stmt = stmt.where(func.abs(Transaction.amount) >= f.min_amount)
    if f.max_amount is not None:
        stmt = stmt.where(func.abs(Transaction.amount) <= f.max_amount)
    return stmt


def list_transactions(db: Session, f: TransactionFilters, limit: int, offset: int):
    base = _filtered(db, f).subquery()
    total, income, expense = db.execute(
        select(
            func.count(),
            func.coalesce(func.sum(base.c.amount).filter(base.c.kind == TransactionKind.INCOME), 0),
            func.coalesce(func.sum(base.c.amount).filter(base.c.kind == TransactionKind.EXPENSE), 0),
        ).select_from(base)
    ).one()
    items = db.scalars(
        _filtered(db, f)
        .options(
            selectinload(Transaction.tags),
            selectinload(Transaction.attachments),
            selectinload(Transaction.occurrence),
        )
        .order_by(Transaction.date.desc(), Transaction.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return items, total, Decimal(income), Decimal(expense)


def series_id_of(tx: Transaction) -> int | None:
    occ: Occurrence | None = tx.occurrence
    return occ.series_id if occ else None
