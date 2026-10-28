from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.models import Occurrence, OccurrenceStatus, RecurringSeries, Transaction
from app.seed.demo import seed_demo
from app.services.balances import account_balances
from tests.conftest import TODAY


def test_datos_de_ejemplo(db):
    seed_demo(db, TODAY)
    assert db.scalar(select(func.count()).select_from(RecurringSeries)) == 14
    assert db.scalar(select(func.count()).select_from(Transaction)) > 150
    # Nada vencido queda pendiente salvo lo que se gestiona a mano
    pending = db.scalar(
        select(func.count()).select_from(Occurrence)
        .where(Occurrence.status == OccurrenceStatus.PLANNED, Occurrence.due_date <= TODAY)
    )
    assert pending == 0
    assert all(isinstance(b, Decimal) for b in account_balances(db, TODAY).values())
    with pytest.raises(RuntimeError):
        seed_demo(db, TODAY)  # no duplica si ya hay datos
