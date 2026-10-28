"""Datos de ejemplo para probar la app: cuentas, recurrentes y un año de movimientos."""

import random
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.domain.recurrence import LAST_DAY, clamp_day
from app.models import (
    Account,
    AccountType,
    AmountMode,
    BusinessDayAdjust,
    Category,
    Frequency,
    OccurrenceStatus,
    Tag,
    Transaction,
    TransactionKind,
)
from app.schemas.core import TransactionIn
from app.schemas.recurring import ConfirmIn, NewVersionIn, SeriesIn, VersionTerms
from app.services import recurring, transactions
from app.services.recurring import get_series


def _months_ago(today: date, months: int, day: int = 1) -> date:
    total = today.year * 12 + today.month - 1 - months
    return clamp_day(total // 12, total % 12 + 1, day)


def seed_demo(db: Session, today: date, force: bool = False) -> None:
    if not force and db.scalar(select(func.count()).select_from(Transaction)):
        raise RuntimeError("Ya hay movimientos: usa --force para añadir los datos de ejemplo igualmente")

    rng = random.Random(42)
    cats = {c.name: c.id for c in db.scalars(select(Category))}
    start = _months_ago(today, 12)

    def account(name, type_, balance, color, icon, **kw):
        a = Account(name=name, type=type_, initial_balance=Decimal(balance), initial_balance_date=start,
                    color=color, icon=icon, **kw)
        db.add(a)
        db.flush()
        return a.id

    bank = account("Cuenta corriente", AccountType.BANK, "2400.00", "#2563eb", "landmark")
    cash = account("Efectivo", AccountType.CASH, "120.00", "#16a34a", "wallet")
    card = account("Tarjeta de crédito", AccountType.CREDIT_CARD, "0.00", "#dc2626", "credit-card",
                   credit_limit=Decimal("3000"))
    savings = account("Ahorro", AccountType.SAVINGS, "6000.00", "#9333ea", "piggy-bank")
    db.commit()

    tag_viaje = Tag(name="Vacaciones", color="#0ea5e9")
    db.add(tag_viaje)
    db.commit()

    def series(name, kind, amount, category, freq, *, day=None, start_date=start, acc=bank, to=None,
               mode=AmountMode.FIXED, sub=False, adjust=BusinessDayAdjust.NONE, interval=1):
        data = SeriesIn(
            name=name, kind=kind, is_subscription=sub, start_date=start_date, include_past=True,
            terms=VersionTerms(
                frequency=freq, interval=interval, day_of_month=day, business_day_adjust=adjust,
                amount_mode=mode, amount=Decimal(amount), account_id=acc, to_account_id=to,
                category_id=cats.get(category) if category else None, concept=name,
            ),
        )
        return recurring.create_series(db, data, today).id

    series("Nómina", TransactionKind.INCOME, "2150.00", "Nómina", Frequency.MONTHLY, day=28,
           adjust=BusinessDayAdjust.PREVIOUS)
    rent = series("Alquiler", TransactionKind.EXPENSE, "800.00", "Alquiler", Frequency.MONTHLY, day=1)
    luz = series("Luz", TransactionKind.EXPENSE, "65.00", "Luz", Frequency.MONTHLY, day=12,
                 mode=AmountMode.VARIABLE, adjust=BusinessDayAdjust.NEXT)
    agua = series("Agua", TransactionKind.EXPENSE, "38.00", "Agua", Frequency.MONTHLY, interval=2, day=20,
                  mode=AmountMode.VARIABLE)
    series("Fibra y móvil", TransactionKind.EXPENSE, "45.90", "Internet", Frequency.MONTHLY, day=5)
    series("Netflix", TransactionKind.EXPENSE, "13.99", "Streaming", Frequency.MONTHLY, day=15, acc=card, sub=True)
    series("Spotify", TransactionKind.EXPENSE, "11.99", "Streaming", Frequency.MONTHLY, day=3, acc=card, sub=True)
    series("Gimnasio", TransactionKind.EXPENSE, "34.90", "Deporte", Frequency.MONTHLY, day=LAST_DAY)
    series("Seguro de coche", TransactionKind.EXPENSE, "385.00", "Seguro de coche", Frequency.YEARLY,
           start_date=_months_ago(today, 7, 10))
    series("Seguro de hogar", TransactionKind.EXPENSE, "96.50", "Seguro de hogar", Frequency.SEMIANNUAL,
           start_date=_months_ago(today, 4, 18))
    series("IBI", TransactionKind.EXPENSE, "412.30", "IBI", Frequency.YEARLY, start_date=_months_ago(today, 11, 25))
    series("Comunidad", TransactionKind.EXPENSE, "180.00", "Comunidad", Frequency.QUARTERLY, day=10)
    series("Ahorro mensual", TransactionKind.TRANSFER, "200.00", None, Frequency.MONTHLY, day=29, to=savings)
    series("Retirada de efectivo", TransactionKind.TRANSFER, "150.00", None, Frequency.MONTHLY, day=2, to=cash)

    # Subida del alquiler hace 5 meses: cambio "a partir de esta fecha".
    rent_series = get_series(db, rent)
    rent_terms = VersionTerms.model_validate(rent_series.versions[0]).model_copy(
        update={"amount": Decimal("850.00")}
    )
    recurring.add_version(db, rent, NewVersionIn(effective_from=_months_ago(today, 5, 1), terms=rent_terms), today)

    # Confirmar los importes reales de los recurrentes variables ya vencidos.
    for sid, base in ((luz, 65), (agua, 38)):
        for occ in get_series(db, sid).occurrences:
            if occ.status == OccurrenceStatus.PLANNED and occ.due_date <= today:
                real = Decimal(str(round(base * rng.uniform(0.7, 1.4), 2)))
                recurring.confirm_occurrence(db, occ.id, ConfirmIn(amount=real))

    # Movimientos puntuales del último año.
    def tx(kind, amount, d, concept, category, acc=bank, tags=None):
        transactions.create_transaction(db, TransactionIn(
            kind=kind, amount=Decimal(str(amount)), date=d, concept=concept,
            category_id=cats[category], account_id=acc, tag_ids=tags or [],
        ))

    shops = ["Mercadona", "Consum", "Lidl", "Carrefour"]
    d = start
    while d <= today:
        if d.weekday() == 5:
            tx(TransactionKind.EXPENSE, round(rng.uniform(45, 120), 2), d, rng.choice(shops), "Supermercado")
        if d.weekday() == 2 and rng.random() < 0.6:
            tx(TransactionKind.EXPENSE, round(rng.uniform(8, 30), 2), d, "Compra semanal", "Supermercado", acc=cash)
        if d.weekday() == 4 and rng.random() < 0.5:
            tx(TransactionKind.EXPENSE, round(rng.uniform(25, 70), 2), d, "Cena fuera", "Restaurantes", acc=card)
        if d.day == 14:
            tx(TransactionKind.EXPENSE, round(rng.uniform(50, 75), 2), d, "Repsol", "Combustible")
        if rng.random() < 0.05:
            tx(TransactionKind.EXPENSE, round(rng.uniform(5, 40), 2), d, "Farmacia", "Farmacia", acc=cash)
        if d.day == 1 and d.month in (1, 4, 7, 10):
            tx(TransactionKind.INCOME, round(rng.uniform(5, 15), 2), d, "Intereses cuenta", "Intereses y dividendos", acc=savings)
        d += timedelta(days=1)

    trip = _months_ago(today, 3, 8)
    tx(TransactionKind.EXPENSE, 320, trip, "Hotel Peñíscola", "Viajes", acc=card, tags=[tag_viaje.id])
    tx(TransactionKind.EXPENSE, 86.4, trip + timedelta(days=1), "Restaurante El Puerto", "Restaurantes", acc=card, tags=[tag_viaje.id])
    tx(TransactionKind.INCOME, 312.45, _months_ago(today, 4, 20), "Devolución IRPF", "Hacienda")

    # Liquidación mensual de la tarjeta: el día 1 se paga desde el banco lo gastado el mes anterior.
    for months in range(11, -1, -1):
        pay_day = _months_ago(today, months, 1)
        prev_from = _months_ago(today, months + 1, 1)
        spent = db.scalar(
            select(func.coalesce(func.sum(Transaction.amount), 0)).where(
                Transaction.account_id == card,
                Transaction.kind == TransactionKind.EXPENSE,
                Transaction.date >= prev_from,
                Transaction.date < pay_day,
            )
        )
        if spent:
            transactions.create_transaction(db, TransactionIn(
                kind=TransactionKind.TRANSFER, amount=spent, date=pay_day, concept="Liquidación tarjeta",
                account_id=bank, to_account_id=card,
            ))
    db.commit()
