"""Previsión de flujo de caja, provisiones (hucha virtual) y preferencias."""

from datetime import date
from decimal import Decimal

import pytest

from app.models import AccountType, AmountMode, Frequency, Transaction, TransactionKind
from app.schemas.recurring import SeriesIn, VersionTerms
from app.services import recurring
from app.services.planning import forecast, non_recurring_average, provisions
from tests.conftest import TODAY

D = Decimal


def series(db, account_id, cat_id, name, amount, start, kind=TransactionKind.EXPENSE, **kw):
    terms = VersionTerms(
        frequency=kw.pop("frequency", Frequency.MONTHLY), amount=D(amount), account_id=account_id,
        category_id=cat_id, concept=name, amount_mode=kw.pop("amount_mode", AmountMode.FIXED),
        to_account_id=kw.pop("to_account_id", None),
    )
    return recurring.create_series(db, SeriesIn(name=name, kind=kind, start_date=start, terms=terms, **kw), TODAY)


@pytest.fixture
def setup(db, make_account, cat, income_cat):
    """Banco 1000 €, tarjeta con límite 500 € y ahorro fuera del total."""
    bank = make_account("Banco", initial="1000")
    card = make_account("Visa", AccountType.CREDIT_CARD)
    card.credit_limit = D("500")
    savings = make_account("Ahorro", AccountType.SAVINGS, initial="600")
    savings.include_in_total = False
    db.commit()
    series(db, bank.id, income_cat, "Nómina", "2000", date(2026, 6, 28), kind=TransactionKind.INCOME, )
    series(db, bank.id, cat("Alquiler"), "Alquiler", "800", date(2026, 7, 1))
    # Variable vencida sin confirmar: se aplica hoy
    series(db, bank.id, cat("Luz"), "Luz", "60", date(2026, 6, 12), include_past=True, amount_mode=AmountMode.VARIABLE)
    # Movimientos ya apuntados con fecha futura
    db.add(Transaction(kind=TransactionKind.EXPENSE, amount=D("600"), date=date(2026, 7, 5), concept="Ordenador",
                       category_id=cat("Hogar y mobiliario"), account_id=card.id))
    db.add(Transaction(kind=TransactionKind.TRANSFER, amount=D("600"), date=date(2026, 7, 10), concept="Pago Visa",
                       account_id=bank.id, to_account_id=card.id))
    # Gasto no recurrente de abril y mayo (en la cuenta fuera del total, para no tocar el saldo de partida)
    for d in (date(2026, 4, 20), date(2026, 5, 20)):
        db.add(Transaction(kind=TransactionKind.EXPENSE, amount=D("300"), date=d, concept="Súper",
                           category_id=cat("Supermercado"), account_id=savings.id))
    db.commit()
    return bank, card, savings


def test_prevision_dia_a_dia(db, setup):
    bank, card, savings = setup
    f = forecast(db, TODAY, 3, include_variable=False, threshold=D("1000"))
    assert f["end_date"] == date(2026, 9, 15)
    assert f["start_balance"] == D("1000.00")
    assert f["end_balance"] == D("3760.00")
    assert len(f["points"]) == 93
    # Lo más bajo es hoy: la luz pendiente (60 €) ya cuenta
    assert f["lowest"] == {"date": TODAY, "balance": D("940.00")}
    assert f["first_below_threshold"] == {"date": TODAY, "balance": D("940.00")}

    june, july, aug, sept = f["monthly"]
    assert (june["start"], june["income"], june["expense"], june["end"], june["min"]) == (
        D("1000.00"), D("2000.00"), D("60.00"), D("2940.00"), D("940.00"))
    assert june["below_threshold"]
    # Julio: alquiler + ordenador con tarjeta + luz; la transferencia banco→tarjeta es interna
    assert (july["expense"], july["transfers"], july["end"], july["min"], july["min_date"]) == (
        D("1460.00"), D("0.00"), D("3480.00"), D("1480.00"), date(2026, 7, 12))
    assert not july["below_threshold"]
    assert sept["end"] == f["end_balance"]

    accounts = {a["name"]: a for a in f["accounts"]}
    assert accounts["Visa"]["min"] == D("-600.00") and accounts["Visa"]["floor"] == D("-500")
    assert accounts["Visa"]["below_floor"]  # supera el límite de la tarjeta antes del pago
    assert accounts["Visa"]["end"] == D("0.00")
    assert not accounts["Banco"]["below_floor"]
    assert accounts["Ahorro"]["start"] == D("0.00") and not accounts["Ahorro"]["include_in_total"]


def test_prevision_con_gasto_no_recurrente(db, setup):
    avg = non_recurring_average(db, TODAY)
    assert avg == {"income": D("0.00"), "expense": D("300.00"), "months": 2}
    base = forecast(db, TODAY, 3, include_variable=False, threshold=D("0"))
    with_var = forecast(db, TODAY, 3, include_variable=True, threshold=D("0"))
    expected = D("300") * 12 / D("365.25") * 92  # 92 días después de hoy
    assert abs((base["end_balance"] - with_var["end_balance"]) - expected) < D("0.02")
    assert with_var["monthly"][1]["expense"] > base["monthly"][1]["expense"]


def test_prevision_empezando_de_cero(db, make_account, cat, income_cat):
    """Caso real del primer día: cuenta a 0 €, sin historial."""
    bank = make_account("Banco", initial="0")
    series(db, bank.id, cat("Alquiler"), "Alquiler", "800", date(2026, 7, 1))
    series(db, bank.id, income_cat, "Nómina", "2000", date(2026, 7, 28), kind=TransactionKind.INCOME)
    f = forecast(db, TODAY, 3, include_variable=True, threshold=D("0"))
    assert f["variable"]["months"] == 0  # sin historial no se inventa gasto
    assert f["first_below_threshold"] == {"date": date(2026, 7, 1), "balance": D("-800.00")}
    assert f["accounts"][0]["below_floor"]
    assert f["end_balance"] == D("-800") * 3 + D("2000") * 2


def test_provisiones(db, make_account, cat):
    bank = make_account()
    # Seguido desde el pago anterior: la hucha va por la parte proporcional
    series(db, bank.id, cat("IBI"), "IBI", "412.30", date(2025, 9, 25), frequency=Frequency.YEARLY, include_past=True)
    # Dado de alta hoy a mitad de ciclo: la hucha empieza en 0 y la cuota es mayor que la normal
    series(db, bank.id, cat("Seguro de coche"), "Seguro coche", "385", date(2026, 3, 10), frequency=Frequency.YEARLY)
    series(db, bank.id, cat("Comunidad"), "Comunidad", "180", date(2026, 4, 10), frequency=Frequency.QUARTERLY,
           include_past=True)
    # No entran: mensuales e ingresos
    series(db, bank.id, cat("Alquiler"), "Alquiler", "800", date(2026, 7, 1))

    p = provisions(db, TODAY)
    items = {i["name"]: i for i in p["items"]}
    assert list(items) == ["Comunidad", "IBI", "Seguro coche"]  # por fecha del próximo pago

    ibi = items["IBI"]
    assert (ibi["accumulated"], ibi["remaining"], ibi["monthly_to_go"], ibi["ideal_monthly"]) == (
        D("297.08"), D("115.22"), D("34.38"), D("34.36"))
    assert not ibi["started_late"] and ibi["cycle_start"] == date(2025, 9, 25)

    car = items["Seguro coche"]
    assert car["started_late"] and car["cycle_start"] == TODAY
    assert car["accumulated"] == D("0.00") and car["progress"] == D("0.0")
    assert car["monthly_to_go"] == D("43.73") and car["ideal_monthly"] == D("32.08")

    com = items["Comunidad"]
    assert (com["accumulated"], com["remaining"], com["days_left"]) == (D("130.55"), D("49.45"), 25)
    assert com["monthly_to_go"] == D("49.45")  # queda menos de un mes: apartar todo lo que falta

    assert p["needed"] == D("977.30")
    assert p["accumulated"] == D("427.63")
    assert p["ideal_monthly"] == D("34.36") + D("32.08") + D("60.00")


def test_preferencias_y_endpoints(auth_client):
    assert auth_client.get("/api/settings").json() == {"low_balance_threshold": "0.00", "forecast_include_variable": True}
    r = auth_client.put("/api/settings", json={"low_balance_threshold": "250", "forecast_include_variable": False})
    assert r.json()["low_balance_threshold"] == "250.00"
    f = auth_client.get("/api/reports/forecast", params={"months": 6}).json()
    assert f["months"] == 6 and f["threshold"] == "250.00" and f["include_variable"] is False
    assert auth_client.get("/api/reports/forecast", params={"months": 5}).status_code == 422
    assert auth_client.get("/api/reports/provisions").json()["items"] == []
