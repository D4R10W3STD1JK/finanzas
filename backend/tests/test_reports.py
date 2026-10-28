"""Dashboard, coste mensual equivalente y suscripciones."""

from datetime import date
from decimal import Decimal

import pytest

from app.domain.costs import annual_cost, monthly_cost
from app.domain.recurrence import Frequency, Unit
from app.models import AmountMode, Transaction, TransactionKind
from app.schemas.recurring import ConfirmIn, SeriesIn, VersionTerms
from app.services import recurring
from app.services.reports import dashboard, recurring_costs, savings_rate
from tests.conftest import TODAY

D = Decimal


@pytest.mark.parametrize(
    ("amount", "freq", "interval", "unit", "monthly", "annual"),
    [
        ("100", Frequency.MONTHLY, 1, None, "100.00", "1200.00"),
        ("300", Frequency.QUARTERLY, 1, None, "100.00", "1200.00"),
        ("96.50", Frequency.SEMIANNUAL, 1, None, "16.08", "193.00"),
        ("412.30", Frequency.YEARLY, 1, None, "34.36", "412.30"),
        ("38", Frequency.MONTHLY, 2, None, "19.00", "228.00"),
        ("10", Frequency.WEEKLY, 1, None, "43.48", "521.79"),
        ("1", Frequency.DAILY, 1, None, "30.44", "365.25"),
        ("30", Frequency.CUSTOM, 10, Unit.DAY, "91.31", "1095.75"),
        ("50", Frequency.CUSTOM, 2, Unit.WEEK, "108.71", "1304.46"),
    ],
)
def test_coste_equivalente(amount, freq, interval, unit, monthly, annual):
    assert monthly_cost(D(amount), freq, interval, unit) == D(monthly)
    assert annual_cost(D(amount), freq, interval, unit) == D(annual)


def test_tasa_de_ahorro():
    assert savings_rate(D("2000"), D("1050")) == D("47.5")
    assert savings_rate(D("1000"), D("1200")) == D("-20.0")
    assert savings_rate(D("0"), D("100")) is None


@pytest.fixture
def bank(make_account):
    return make_account("Banco", initial="1000")


def add_tx(db, bank, kind, amount, d, category_id=None, **kw):
    db.add(Transaction(kind=kind, amount=D(amount), date=d, concept="x", category_id=category_id, account_id=bank.id, **kw))


def series(db, bank, cat_id, name, amount, start, kind=TransactionKind.EXPENSE, **kw):
    terms = VersionTerms(
        frequency=kw.pop("frequency", Frequency.MONTHLY), amount=D(amount), account_id=bank.id,
        category_id=cat_id, concept=name, amount_mode=kw.pop("amount_mode", AmountMode.FIXED),
    )
    return recurring.create_series(db, SeriesIn(name=name, kind=kind, start_date=start, terms=terms, **kw), TODAY)


def test_dashboard(db, bank, make_account, cat, income_cat):
    savings_acc = make_account("Ahorro")
    E, I = TransactionKind.EXPENSE, TransactionKind.INCOME
    add_tx(db, bank, I, "2000", date(2026, 4, 28), income_cat)
    add_tx(db, bank, E, "500", date(2026, 4, 10), cat("Supermercado"))
    add_tx(db, bank, I, "2000", date(2026, 5, 28), income_cat)
    add_tx(db, bank, E, "300", date(2026, 5, 3), cat("Supermercado"))
    add_tx(db, bank, E, "100", date(2026, 5, 9), cat("Restaurantes"))
    add_tx(db, bank, E, "800", date(2026, 5, 1), cat("Alquiler"))
    add_tx(db, bank, I, "2000", date(2026, 6, 1), income_cat)
    add_tx(db, bank, E, "200", date(2026, 6, 5), cat("Supermercado"))
    add_tx(db, bank, E, "800", date(2026, 6, 1), cat("Alquiler"))
    add_tx(db, bank, E, "50", date(2026, 6, 7))
    # No cuentan como ingreso ni gasto:
    add_tx(db, bank, TransactionKind.TRANSFER, "300", date(2026, 6, 2), to_account_id=savings_acc.id)
    add_tx(db, bank, TransactionKind.ADJUSTMENT, "-12.5", date(2026, 6, 3))
    db.commit()
    series(db, bank, cat("Internet"), "Fibra", "45", date(2026, 6, 20))
    series(db, bank, cat("Luz"), "Luz", "60", date(2026, 6, 1), include_past=True, amount_mode=AmountMode.VARIABLE)

    d = dashboard(db, date(2026, 6, 10), TODAY)
    assert d["month"] == date(2026, 6, 1) and d["is_current_month"]
    assert d["current"] == {"income": D("2000.00"), "expense": D("1050.00"), "savings": D("950.00"), "savings_rate": D("47.5")}
    assert d["previous"]["expense"] == D("1200.00") and d["previous"]["savings_rate"] == D("40.0")
    # Media solo de los meses con datos (abril y mayo), no de 12
    assert d["average_months"] == 2
    assert d["average"]["income"] == D("2000.00") and d["average"]["expense"] == D("850.00")
    assert d["last_12_months"]["savings_rate"] == D("54.2")

    evo = d["evolution"]
    assert len(evo) == 12 and evo[0]["month"] == date(2025, 7, 1) and evo[-1]["month"] == date(2026, 6, 1)
    assert [e["has_data"] for e in evo].count(True) == 3

    cats = [(c["name"], c["amount"], c["share"]) for c in d["expenses_by_category"]]
    assert cats == [
        ("Vivienda", D("800"), D("76.2")),
        ("Alimentación", D("200"), D("19.0")),
        ("Sin categoría", D("50"), D("4.8")),
    ]
    assert d["expenses_by_category"][0]["children"][0]["name"] == "Alquiler"

    assert d["upcoming"] == {"income": D("0.00"), "expense": D("105.00"), "count": 2}  # fibra 20/6 + luz 12/7
    assert d["pending_count"] == 1  # luz de junio, variable
    assert d["total_balance"] == D("1000") + D("6000") - D("2750") - D("12.5")


def test_dashboard_sin_datos(db):
    d = dashboard(db, TODAY, TODAY)
    assert d["previous"] is None and d["average"] is None
    assert d["current"]["savings_rate"] is None
    assert d["expenses_by_category"] == []


def test_dashboard_de_otro_mes(db, bank, cat):
    add_tx(db, bank, TransactionKind.EXPENSE, "99", date(2026, 2, 14), cat("Restaurantes"))
    db.commit()
    d = dashboard(db, date(2026, 2, 1), TODAY)
    assert not d["is_current_month"]
    assert d["current"]["expense"] == D("99.00")
    assert d["evolution"][-1]["month"] == date(2026, 2, 1)


def test_coste_mensual_equivalente_y_suscripciones(db, bank, cat, income_cat):
    series(db, bank, cat("Alquiler"), "Alquiler", "800", date(2026, 7, 1))
    series(db, bank, cat("IBI"), "IBI", "412.30", date(2026, 9, 25), frequency=Frequency.YEARLY)
    series(db, bank, cat("Streaming"), "Netflix", "13.99", date(2026, 6, 20), is_subscription=True)
    series(db, bank, income_cat, "Nómina", "2000", date(2026, 6, 28), kind=TransactionKind.INCOME)
    luz = series(db, bank, cat("Luz"), "Luz", "60", date(2026, 3, 12), include_past=True,
                 amount_mode=AmountMode.VARIABLE)
    for occ, real in zip(luz.occurrences[:3], ("70", "50", "66"), strict=True):
        recurring.confirm_occurrence(db, occ.id, ConfirmIn(amount=D(real)))
    # Terminada: no aparece
    series(db, bank, cat("Cursos"), "Curso", "100", date(2026, 1, 10), include_past=True, max_occurrences=2)

    c = recurring_costs(db, TODAY)
    by_name = {i["name"]: i for i in c["items"]}
    assert set(by_name) == {"Alquiler", "IBI", "Netflix", "Nómina", "Luz"}
    assert by_name["IBI"]["monthly"] == D("34.36") and by_name["IBI"]["next_due_date"] == date(2026, 9, 25)
    luz_cost = by_name["Luz"]
    assert luz_cost["basis"] == "average" and luz_cost["base_amount"] == D("62.00")
    assert luz_cost["last_12m_total"] == D("186.00") and luz_cost["last_12m_count"] == 3
    assert by_name["Alquiler"]["basis"] == "fixed"

    assert c["expense"]["monthly"] == D("910.35")
    assert c["expense"]["count"] == 4
    assert c["subscriptions"] == {"monthly": D("13.99"), "annual": D("167.88"), "count": 1}
    assert c["income"]["monthly"] == D("2000.00")
    assert c["net_monthly"] == D("1089.65")
    assert [i["name"] for i in c["items"]][0] == "Nómina"  # ordenado por coste mensual


def test_endpoints(auth_client):
    r = auth_client.get("/api/reports/dashboard", params={"month": "2026-05-01"})
    assert r.status_code == 200 and r.json()["month"] == "2026-05-01"
    assert auth_client.get("/api/reports/recurring-costs").json()["items"] == []
