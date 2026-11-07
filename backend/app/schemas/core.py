from datetime import date, datetime
from decimal import Decimal

from pydantic import Field, model_validator

from app.models.enums import AccountType, CategoryKind, TransactionKind
from app.schemas.common import Color, Icon, Money, PositiveMoney, Schema

# --- Autenticación ---


class LoginIn(Schema):
    username: str
    password: str


class UserOut(Schema):
    id: int
    username: str


class AuthOptionsOut(Schema):
    registration_open: bool
    has_users: bool


class UserCreateIn(Schema):
    username: str = Field(min_length=2, max_length=50, pattern=r"^\S(.*\S)?$")
    password: str = Field(min_length=8)


class RegisterIn(UserCreateIn):
    # Festivos para mover los pagos a día hábil; si no se indican, los de la instalación.
    holidays_country: str | None = None
    holidays_subdiv: str | None = None


class ChangePasswordIn(Schema):
    current_password: str
    new_password: str = Field(min_length=8)


# --- Cuentas ---


class AccountBase(Schema):
    name: str = Field(min_length=1, max_length=100)
    type: AccountType
    initial_balance: Money = Decimal("0")
    initial_balance_date: date
    credit_limit: PositiveMoney | None = None
    color: Color = "#64748b"
    icon: Icon = "wallet"
    include_in_total: bool = True
    archived: bool = False
    sort_order: int = 0
    notes: str | None = None


class AccountIn(AccountBase):
    pass


class AccountPatch(Schema):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    type: AccountType | None = None
    initial_balance: Money | None = None
    initial_balance_date: date | None = None
    credit_limit: PositiveMoney | None = None
    color: Color | None = None
    icon: Icon | None = None
    include_in_total: bool | None = None
    archived: bool | None = None
    sort_order: int | None = None
    notes: str | None = None


class AccountOut(AccountBase):
    id: int
    currency: str
    balance: Money


class ReconcileIn(Schema):
    real_balance: Money
    date: date
    notes: str | None = None


# --- Categorías y etiquetas ---


class CategoryIn(Schema):
    name: str = Field(min_length=1, max_length=100)
    kind: CategoryKind
    parent_id: int | None = None
    icon: Icon = "tag"
    color: Color = "#64748b"
    archived: bool = False
    sort_order: int = 0


class CategoryPatch(Schema):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    parent_id: int | None = None
    icon: Icon | None = None
    color: Color | None = None
    archived: bool | None = None
    sort_order: int | None = None


class CategoryOut(Schema):
    id: int
    name: str
    kind: CategoryKind
    parent_id: int | None
    icon: str
    color: str
    archived: bool
    sort_order: int


class TagIn(Schema):
    name: str = Field(min_length=1, max_length=50)
    color: Color = "#64748b"


class TagOut(Schema):
    id: int
    name: str
    color: str


# --- Movimientos ---


class TransactionIn(Schema):
    kind: TransactionKind
    amount: Money
    date: date
    concept: str = Field(min_length=1, max_length=200)
    category_id: int | None = None
    account_id: int
    to_account_id: int | None = None
    notes: str | None = None
    is_deductible: bool = False
    tag_ids: list[int] = []

    @model_validator(mode="after")
    def _check(self):
        if self.kind == TransactionKind.ADJUSTMENT:
            raise ValueError("Los ajustes se crean desde la conciliación de la cuenta")
        if self.amount <= 0:
            raise ValueError("El importe debe ser mayor que cero")
        if self.kind == TransactionKind.TRANSFER:
            if self.to_account_id is None:
                raise ValueError("Una transferencia necesita cuenta de destino")
            if self.to_account_id == self.account_id:
                raise ValueError("Las cuentas de origen y destino deben ser distintas")
            self.category_id = None
        else:
            self.to_account_id = None
        return self


class AttachmentOut(Schema):
    id: int
    filename: str
    mime_type: str
    size: int
    created_at: datetime


class TransactionOut(Schema):
    id: int
    kind: TransactionKind
    amount: Money
    date: date
    concept: str
    category_id: int | None
    account_id: int
    to_account_id: int | None
    notes: str | None
    is_deductible: bool
    tags: list[TagOut]
    attachments: list[AttachmentOut]
    occurrence_id: int | None
    series_id: int | None = None
    created_at: datetime


class TransactionPage(Schema):
    items: list[TransactionOut]
    total: int
    sum_income: Money
    sum_expense: Money
