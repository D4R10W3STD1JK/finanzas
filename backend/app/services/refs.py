"""Validación de referencias (cuentas, categorías, etiquetas) compartida por movimientos y recurrentes."""

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Account, Category, CategoryKind, Tag, TransactionKind
from app.services.errors import Invalid


def check_account(db: Session, account_id: int, label: str = "La cuenta") -> Account:
    account = db.get(Account, account_id)
    if account is None:
        raise Invalid(f"{label} no existe")
    return account


def check_category(db: Session, category_id: int | None, kind: TransactionKind) -> Category | None:
    if category_id is None:
        return None
    if kind not in (TransactionKind.INCOME, TransactionKind.EXPENSE):
        raise Invalid("Las transferencias y ajustes no llevan categoría")
    category = db.get(Category, category_id)
    if category is None:
        raise Invalid("La categoría no existe")
    if category.kind != CategoryKind(kind.value):
        raise Invalid(
            "La categoría es de ingresos y el movimiento es un gasto"
            if category.kind == CategoryKind.INCOME
            else "La categoría es de gastos y el movimiento es un ingreso"
        )
    return category


def load_tags(db: Session, tag_ids: list[int]) -> list[Tag]:
    if not tag_ids:
        return []
    tags = list(db.scalars(select(Tag).where(Tag.id.in_(set(tag_ids)))))
    if len(tags) != len(set(tag_ids)):
        raise Invalid("Alguna etiqueta no existe")
    return tags


def check_transfer_accounts(
    db: Session, kind: TransactionKind, account_id: int, to_account_id: int | None
) -> None:
    check_account(db, account_id)
    if kind == TransactionKind.TRANSFER:
        if to_account_id is None:
            raise Invalid("Una transferencia necesita cuenta de destino")
        if to_account_id == account_id:
            raise Invalid("Las cuentas de origen y destino deben ser distintas")
        check_account(db, to_account_id, "La cuenta de destino")
    elif to_account_id is not None:
        raise Invalid("Solo las transferencias llevan cuenta de destino")
