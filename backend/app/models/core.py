import datetime as dt
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.enums import AccountType, CategoryKind, TransactionKind, str_enum

Money = Numeric(14, 2)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Owned:
    """Fila que pertenece a un usuario. Cada usuario solo ve las suyas: ver app/tenancy.py."""

    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)


class User(TimestampMixin, Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(50), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))


class Account(Owned, TimestampMixin, Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    type: Mapped[AccountType] = mapped_column(str_enum(AccountType))
    currency: Mapped[str] = mapped_column(String(3), default="EUR")
    initial_balance: Mapped[Decimal] = mapped_column(Money, default=Decimal("0"))
    initial_balance_date: Mapped[date] = mapped_column(Date)
    credit_limit: Mapped[Decimal | None] = mapped_column(Money)
    color: Mapped[str] = mapped_column(String(20), default="#64748b")
    icon: Mapped[str] = mapped_column(String(50), default="wallet")
    include_in_total: Mapped[bool] = mapped_column(Boolean, default=True)
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str | None] = mapped_column(Text)


class Category(Owned, TimestampMixin, Base):
    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id", ondelete="RESTRICT"))
    name: Mapped[str] = mapped_column(String(100))
    kind: Mapped[CategoryKind] = mapped_column(str_enum(CategoryKind))
    icon: Mapped[str] = mapped_column(String(50), default="tag")
    color: Mapped[str] = mapped_column(String(20), default="#64748b")
    archived: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    parent: Mapped["Category | None"] = relationship(remote_side=[id], back_populates="children")
    children: Mapped[list["Category"]] = relationship(back_populates="parent")


class Tag(Owned, Base):
    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("user_id", "name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(50))
    color: Mapped[str] = mapped_column(String(20), default="#64748b")


transaction_tags = Table(
    "transaction_tags",
    Base.metadata,
    Column("transaction_id", ForeignKey("transactions.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Transaction(Owned, TimestampMixin, Base):
    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint(
            "(kind = 'adjustment' AND amount <> 0) OR (kind <> 'adjustment' AND amount > 0)",
            name="amount_sign",
        ),
        CheckConstraint(
            "(kind = 'transfer') = (to_account_id IS NOT NULL)", name="transfer_destination"
        ),
        CheckConstraint("to_account_id IS NULL OR to_account_id <> account_id", name="transfer_distinct"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[TransactionKind] = mapped_column(str_enum(TransactionKind), index=True)
    # Siempre positivo salvo en los ajustes; el signo lo da el tipo.
    amount: Mapped[Decimal] = mapped_column(Money)
    date: Mapped[dt.date] = mapped_column(Date, index=True)
    concept: Mapped[str] = mapped_column(String(200))
    category_id: Mapped[int | None] = mapped_column(
        ForeignKey("categories.id", ondelete="RESTRICT"), index=True
    )
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id", ondelete="RESTRICT"), index=True)
    to_account_id: Mapped[int | None] = mapped_column(
        ForeignKey("accounts.id", ondelete="RESTRICT"), index=True
    )
    notes: Mapped[str | None] = mapped_column(Text)
    is_deductible: Mapped[bool] = mapped_column(Boolean, default=False)
    occurrence_id: Mapped[int | None] = mapped_column(
        ForeignKey("occurrences.id", ondelete="SET NULL"), unique=True
    )
    # Preparado para la importación de extractos (fase posterior).
    import_batch_id: Mapped[int | None] = mapped_column(Integer)
    import_hash: Mapped[str | None] = mapped_column(String(64), index=True)

    category: Mapped[Category | None] = relationship()
    account: Mapped[Account] = relationship(foreign_keys=[account_id])
    to_account: Mapped[Account | None] = relationship(foreign_keys=[to_account_id])
    tags: Mapped[list[Tag]] = relationship(secondary=transaction_tags, order_by=Tag.name)
    attachments: Mapped[list["Attachment"]] = relationship(
        back_populates="transaction", cascade="all, delete-orphan", order_by="Attachment.id"
    )
    occurrence: Mapped["Occurrence | None"] = relationship(back_populates="transaction")  # noqa: F821


class Attachment(Owned, Base):
    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    transaction_id: Mapped[int] = mapped_column(
        ForeignKey("transactions.id", ondelete="CASCADE"), index=True
    )
    filename: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    # Ruta relativa dentro del directorio de adjuntos.
    storage_name: Mapped[str] = mapped_column(String(255), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    transaction: Mapped[Transaction] = relationship(back_populates="attachments")
