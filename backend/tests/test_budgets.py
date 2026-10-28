"""Presupuestos mensuales por categoría y objetivos de ahorro."""

from datetime import date, datetime
from decimal import Decimal
from zoneinfo import ZoneInfo

import pytest

from app.models import AccountType, AmountMode, Frequency, GoalMode, Transaction, TransactionKind
from app.schemas.budgets import BudgetIn, BudgetOverrideIn, ContributionIn, GoalIn
from app.schemas.recurring import SeriesIn, VersionTerms
from app.services import budgets as svc
from app.services import recurring
from app.services.errors import Conflict, Invalid
from tests.conftest import TODAY

D = Decimal
JUNE = date(2026, 6, 1)


def spend(db, account, category_id, amount, d, kind=TransactionKind.EXPENSE):
    db.add(Transaction(kind=kind, amount=D(amount), date=d, concept="x", category_id=category_id, account_id=account.id))


def budget(db, category_id, amount, **kw):
    return svc.create_budget(db, BudgetIn(category_id=category_id, amount=D(amount), **kw), TODAY)


@pytest.fixture
def bank(make_account):
    return make_account()


def by_name(month_status):
    return {i["name"]: i for i in month_status["items"]}


def test_estado_del_mes(db, bank, cat, income_cat):
    spend(db, bank, cat("Supermercado"), "250", date(2026, 6, 3))
    spend(db, bank, cat("Restaurantes"), "60", date(2026, 6, 10))
    spend(db, bank, cat("Alimentación"), "20", date(2026, 6, 11))  # en la categoría padre directamente
    spend(db, bank, cat("Supermercado"), "999", date(2026, 5, 30))  # otro mes
    spend(db, bank, cat("Combustible"), "70", date(2026, 6, 5))
    spend(db, bank, cat("Farmacia"), "15", date(2026, 6, 6))  # sin presupuesto
    spend(db, bank, None, "5", date(2026, 6, 7))  # sin categoría
    spend(db, bank, income_cat, "2000", date(2026, 6, 1), kind=TransactionKind.INCOME)
    db.commit()
    budget(db, cat("Alimentación"), "400")  # incluye Supermercado y Restaurantes
    budget(db, cat("Restaurantes"), "50")  # subcategoría con su propio límite
    budget(db, cat("Transporte"), "80", alert_pct=85)

    m = svc.budget_month(db, JUNE, TODAY)
    items = by_name(m)
    food = items["Alimentación"]
    assert (food["spent"], food["remaining"], food["pct"], food["status"]) == (D("330.00"), D("70.00"), D("82.5"), "warning")
    rest = items["Alimentación › Restaurantes"]
    assert rest["status"] == "over" and rest["remaining"] == D("-10.00") and rest["is_subcategory"]
    assert items["Transporte"]["status"] == "warning"  # 87,5 % ≥ 85 %
    # Ordenado: primero los superados, luego los avisos por porcentaje
    assert [i["name"] for i in m["items"]] == ["Alimentación › Restaurantes", "Transporte", "Alimentación"]
    # La subcategoría no se cuenta dos veces en los totales
    assert m["total_limit"] == D("480.00") and m["total_spent"] == D("400.00")
    assert [(u["name"], u["amount"]) for u in m["unbudgeted"]] == [("Salud", D("15.00")), ("Sin categoría", D("5.00"))]
    assert m["unbudgeted_total"] == D("20.00")
    assert m["is_current_month"] and m["month_elapsed_pct"] == D("50.0")  # 15 de 30


def test_excepcion_de_un_mes_y_mes_de_inicio(db, bank, cat):
    b = budget(db, cat("Ocio"), "100", start_month=date(2026, 6, 20))
    assert b.start_month == JUNE
    svc.set_override(db, b.id, BudgetOverrideIn(month=date(2026, 8, 15), amount=D("300")))
    svc.set_override(db, b.id, BudgetOverrideIn(month=date(2026, 8, 1), amount=D("250")))  # sustituye
    aug = by_name(svc.budget_month(db, date(2026, 8, 1), TODAY))["Ocio"]
    assert (aug["limit"], aug["base_amount"], aug["is_override"]) == (D("250.00"), D("100.00"), True)
    assert not by_name(svc.budget_month(db, date(2026, 7, 1), TODAY))["Ocio"]["is_override"]
    assert svc.budget_month(db, date(2026, 5, 1), TODAY)["items"] == []  # antes de empezar
    b = svc.delete_override(db, b.id, date(2026, 8, 1))
    assert b.overrides == []


def test_comprometido_por_recurrentes(db, bank, cat):
    budget(db, cat("Suministros"), "150")
    spend(db, bank, cat("Luz"), "70", date(2026, 6, 2))
    db.commit()
    terms = VersionTerms(frequency=Frequency.MONTHLY, amount=D("90"), account_id=bank.id, category_id=cat("Gas"),
                         concept="Gas", amount_mode=AmountMode.VARIABLE)
    recurring.create_series(db, SeriesIn(name="Gas", kind=TransactionKind.EXPENSE, start_date=date(2026, 6, 25), terms=terms), TODAY)
    s = by_name(svc.budget_month(db, JUNE, TODAY))["Suministros"]
    assert s["status"] == "ok" and s["committed"] == D("90.00")
    assert s["will_exceed"]  # 70 + 90 > 150


def test_validaciones_de_presupuesto(db, cat, income_cat):
    budget(db, cat("Ocio"), "100")
    with pytest.raises(Conflict):
        budget(db, cat("Ocio"), "200")
    with pytest.raises(Invalid):
        budget(db, income_cat, "100")


def test_presupuesto_a_cero(db, bank, cat):
    b = budget(db, cat("Ocio"), "100")
    svc.set_override(db, b.id, BudgetOverrideIn(month=JUNE, amount=D("0")))
    spend(db, bank, cat("Viajes"), "10", date(2026, 6, 1))
    db.commit()
    s = by_name(svc.budget_month(db, JUNE, TODAY))["Ocio"]
    assert s["status"] == "over" and s["pct"] == D("100.0")


# --- Objetivos ---


def goal(db, **kw):
    data = {"name": "Fondo de emergencia", "target_amount": D("6000"), "mode": GoalMode.MANUAL, **kw}
    return svc.create_goal(db, GoalIn(**data))


def progress(db, g):
    return svc.goal_progress(db, g, TODAY)


def test_objetivo_manual(db):
    g = goal(db, target_date=date(2026, 12, 15))
    g.created_at = datetime(2026, 3, 15, tzinfo=ZoneInfo("Europe/Madrid"))
    for d, amount in ((date(2026, 3, 20), "1000"), (date(2026, 4, 20), "500"), (date(2026, 5, 20), "500"), (date(2026, 6, 1), "-200")):
        svc.add_contribution(db, g.id, ContributionIn(date=d, amount=D(amount)))
    svc.add_contribution(db, g.id, ContributionIn(date=date(2026, 7, 1), amount=D("100")))  # futura: aún no cuenta
    p = progress(db, g)
    assert (p["current"], p["remaining"], p["pct"]) == (D("1800.00"), D("4200.00"), D("30.0"))
    assert p["days_left"] == 183
    assert p["monthly_needed"] == D("698.57")  # 4200 / (183 / 30,4375)
    assert p["monthly_pace"] == D("600.00")  # (1000 + 500 + 500 - 200) / 3: lo aportado en los últimos 91 días
    assert p["status"] == "behind"  # debería ir por el 33 % (92 de 275 días)


def test_objetivo_vinculado_a_cuenta(db, make_account):
    acc = make_account("Ahorro viaje", AccountType.SAVINGS, initial="1500")
    g = goal(db, name="Viaje", target_amount=D("1200"), mode=GoalMode.ACCOUNT, account_id=acc.id)
    assert progress(db, g)["status"] == "completed" and progress(db, g)["pct"] == D("125.0")
    with pytest.raises(Invalid):
        svc.add_contribution(db, g.id, ContributionIn(date=TODAY, amount=D("10")))


def test_estados_de_objetivo(db):
    assert progress(db, goal(db))["status"] == "no_date"
    assert progress(db, goal(db, target_date=date(2026, 6, 1)))["status"] == "overdue"
    g = goal(db, target_date=date(2026, 6, 30))
    assert progress(db, g)["monthly_needed"] == D("6000.00")  # queda menos de un mes


def test_api_presupuestos_y_objetivos(auth_client, make_account, cat):
    r = auth_client.post("/api/budgets", json={"category_id": cat("Ocio"), "amount": "120"})
    assert r.status_code == 201
    bid = r.json()["id"]
    assert auth_client.patch(f"/api/budgets/{bid}", json={"alert_pct": 90}).json()["alert_pct"] == 90
    r = auth_client.put(f"/api/budgets/{bid}/overrides", json={"month": "2026-08-01", "amount": "300"})
    assert r.json()["overrides"] == [{"month": "2026-08-01", "amount": "300.00"}]
    st = auth_client.get("/api/budgets/status", params={"month": "2026-08-10"}).json()
    assert st["month"] == "2026-08-01" and st["items"][0]["limit"] == "300.00"
    assert auth_client.delete(f"/api/budgets/{bid}").status_code == 204

    acc = make_account("Ahorro")
    r = auth_client.post("/api/goals", json={"name": "Coche", "target_amount": "3000", "mode": "account", "account_id": acc.id})
    assert r.status_code == 201 and r.json()["current"] == "0.00"
    r = auth_client.post("/api/goals", json={"name": "Sin cuenta", "target_amount": "100", "mode": "account"})
    assert r.status_code == 422
    # La cuenta vinculada no se puede borrar
    assert auth_client.delete(f"/api/accounts/{acc.id}").status_code == 409

    g = auth_client.post("/api/goals", json={"name": "Viaje", "target_amount": "800", "mode": "manual", "target_date": "2026-12-01"}).json()
    g = auth_client.post(f"/api/goals/{g['id']}/contributions", json={"date": "2026-06-10", "amount": "200"}).json()
    assert g["current"] == "200.00" and g["pct"] == "25.0" and len(g["contributions"]) == 1
    g = auth_client.delete(f"/api/goals/{g['id']}/contributions/{g['contributions'][0]['id']}").json()
    assert g["current"] == "0.00"
    g = auth_client.put(f"/api/goals/{g['id']}", json={**{k: g[k] for k in ("name", "target_amount", "mode", "target_date")}, "archived": True}).json()
    assert g["archived"]
    assert [x["name"] for x in auth_client.get("/api/goals").json()] == ["Coche"]
    assert len(auth_client.get("/api/goals", params={"include_archived": True}).json()) == 2
