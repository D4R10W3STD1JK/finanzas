"""Endpoints: autenticación, cuentas, categorías, movimientos, adjuntos y recurrentes."""

from decimal import Decimal

from app.models import AccountType


def test_health_sin_login(client):
    assert client.get("/api/health").json() == {"status": "ok"}


def test_requiere_login(client):
    r = client.get("/api/accounts")
    assert r.status_code == 401
    assert r.json()["detail"] == "Sesión no iniciada o caducada"


def test_login_logout_y_cambio_de_contraseña(auth_client):
    assert auth_client.get("/api/auth/me").json()["username"] == "Ronald"
    r = auth_client.post("/api/auth/change-password", json={"current_password": "mal", "new_password": "nuevaclave1"})
    assert r.status_code == 400
    r = auth_client.post("/api/auth/change-password", json={"current_password": "secreto123", "new_password": "nuevaclave1"})
    assert r.status_code == 204
    auth_client.post("/api/auth/logout")
    assert auth_client.get("/api/auth/me").status_code == 401
    # el nombre de usuario no distingue mayúsculas
    assert auth_client.post("/api/auth/login", json={"username": "ronald", "password": "nuevaclave1"}).status_code == 200


def test_login_incorrecto_y_bloqueo(client, db):
    from app.models import User
    from app.security import hash_password

    db.add(User(username="Otro", password_hash=hash_password("clave-buena")))
    db.commit()
    for _ in range(5):
        assert client.post("/api/auth/login", json={"username": "Otro", "password": "x"}).status_code == 401
    assert client.post("/api/auth/login", json={"username": "Otro", "password": "clave-buena"}).status_code == 429


def test_cuentas_saldo_y_conciliacion(auth_client):
    acc = auth_client.post("/api/accounts", json={
        "name": "Banco", "type": "bank", "initial_balance": "1500.50", "initial_balance_date": "2026-01-01",
    }).json()
    assert acc["balance"] == "1500.50"
    card = auth_client.post("/api/accounts", json={
        "name": "Visa", "type": AccountType.CREDIT_CARD, "initial_balance_date": "2026-01-01", "credit_limit": "2000",
    }).json()
    cats = {c["name"]: c["id"] for c in auth_client.get("/api/categories").json()}

    auth_client.post("/api/transactions", json={
        "kind": "expense", "amount": "45.30", "date": "2026-06-01", "concept": "Mercadona",
        "category_id": cats["Supermercado"], "account_id": card["id"],
    })
    auth_client.post("/api/transactions", json={
        "kind": "transfer", "amount": "45.30", "date": "2026-06-10", "concept": "Pago tarjeta",
        "account_id": acc["id"], "to_account_id": card["id"],
    })
    balances = {a["name"]: a["balance"] for a in auth_client.get("/api/accounts").json()}
    assert balances == {"Banco": "1455.20", "Visa": "0.00"}

    adj = auth_client.post(f"/api/accounts/{acc['id']}/reconcile", json={"real_balance": "1450.00", "date": "2026-06-15"}).json()
    assert adj["kind"] == "adjustment" and adj["amount"] == "-5.20"
    assert auth_client.get(f"/api/accounts/{acc['id']}").json()["balance"] == "1450.00"
    # sin diferencia no se crea ajuste
    assert auth_client.post(f"/api/accounts/{acc['id']}/reconcile", json={"real_balance": "1450.00", "date": "2026-06-15"}).json() is None

    # no se puede borrar una cuenta con movimientos
    r = auth_client.delete(f"/api/accounts/{acc['id']}")
    assert r.status_code == 409
    assert auth_client.patch(f"/api/accounts/{acc['id']}", json={"archived": True}).json()["archived"] is True
    assert {a["name"] for a in auth_client.get("/api/accounts").json()} == {"Visa"}


def test_movimientos_futuros_no_afectan_al_saldo_actual(auth_client, make_account, expense_cat):
    acc = make_account(initial="100")
    auth_client.post("/api/transactions", json={
        "kind": "expense", "amount": "30", "date": "2026-07-01", "concept": "Futuro",
        "category_id": expense_cat, "account_id": acc.id,
    })
    assert auth_client.get(f"/api/accounts/{acc.id}").json()["balance"] == "100.00"


def test_validaciones_de_movimientos(auth_client, make_account, expense_cat, income_cat):
    acc = make_account()
    base = {"kind": "expense", "amount": "10", "date": "2026-06-01", "concept": "X", "account_id": acc.id}

    r = auth_client.post("/api/transactions", json={**base, "amount": "-5"})
    assert r.status_code == 422 and "mayor que cero" in r.json()["detail"]
    r = auth_client.post("/api/transactions", json={**base, "category_id": income_cat})
    assert r.status_code == 422 and "ingresos" in r.json()["detail"]
    r = auth_client.post("/api/transactions", json={**base, "kind": "transfer", "to_account_id": acc.id})
    assert r.status_code == 422
    r = auth_client.post("/api/transactions", json={**base, "amount": "10.123"})
    assert r.status_code == 422
    assert auth_client.post("/api/transactions", json={**base, "category_id": expense_cat}).status_code == 201


def test_filtros_y_totales(auth_client, make_account, cat, income_cat):
    acc = make_account()
    tag = auth_client.post("/api/tags", json={"name": "Vacaciones"}).json()
    rows = [
        ("expense", "50.00", "2026-05-02", "Mercadona", cat("Supermercado"), []),
        ("expense", "20.00", "2026-05-10", "Bar Manolo", cat("Restaurantes"), [tag["id"]]),
        ("expense", "35.00", "2026-06-01", "Repsol", cat("Combustible"), []),
        ("income", "2000.00", "2026-05-28", "Nómina mayo", income_cat, []),
    ]
    for kind, amount, d, concept, cid, tags in rows:
        auth_client.post("/api/transactions", json={
            "kind": kind, "amount": amount, "date": d, "concept": concept,
            "category_id": cid, "account_id": acc.id, "tag_ids": tags,
        })

    page = auth_client.get("/api/transactions", params={"date_from": "2026-05-01", "date_to": "2026-05-31"}).json()
    assert page["total"] == 3
    assert page["sum_income"] == "2000.00" and page["sum_expense"] == "70.00"
    assert [t["concept"] for t in page["items"]] == ["Nómina mayo", "Bar Manolo", "Mercadona"]

    # filtrar por la categoría padre incluye sus subcategorías
    alimentacion = cat("Alimentación")
    assert auth_client.get("/api/transactions", params={"category_id": alimentacion}).json()["total"] == 2
    assert auth_client.get("/api/transactions", params={"tag_id": tag["id"]}).json()["items"][0]["concept"] == "Bar Manolo"
    assert auth_client.get("/api/transactions", params={"q": "merca"}).json()["total"] == 1
    assert auth_client.get("/api/transactions", params={"kind": "income"}).json()["total"] == 1
    assert auth_client.get("/api/transactions", params={"limit": 2, "offset": 2}).json()["items"][0]["concept"] == "Bar Manolo"


def test_adjuntos(auth_client, make_account, expense_cat):
    acc = make_account()
    tx = auth_client.post("/api/transactions", json={
        "kind": "expense", "amount": "12", "date": "2026-06-01", "concept": "Farmacia",
        "category_id": expense_cat, "account_id": acc.id,
    }).json()
    pdf = b"%PDF-1.4 ticket"
    r = auth_client.post(f"/api/transactions/{tx['id']}/attachments",
                         files={"file": ("ticket farmacia.pdf", pdf, "application/pdf")})
    assert r.status_code == 201
    att = r.json()
    assert att["filename"] == "ticket farmacia.pdf" and att["size"] == len(pdf)

    r = auth_client.get(f"/api/attachments/{att['id']}")
    assert r.status_code == 200 and r.content == pdf

    r = auth_client.post(f"/api/transactions/{tx['id']}/attachments",
                         files={"file": ("virus.exe", b"MZ", "application/x-msdownload")})
    assert r.status_code == 422

    assert auth_client.get(f"/api/transactions/{tx['id']}").json()["attachments"][0]["id"] == att["id"]
    assert auth_client.delete(f"/api/transactions/{tx['id']}").status_code == 204
    assert auth_client.get(f"/api/attachments/{att['id']}").status_code == 404


def test_categorias(auth_client):
    cats = auth_client.get("/api/categories").json()
    names = {c["name"] for c in cats if c["parent_id"] is None}
    assert {"Vivienda", "Suministros", "Alimentación", "Nómina", "Otros ingresos"} <= names

    parent = auth_client.post("/api/categories", json={"name": "Coche eléctrico", "kind": "expense", "icon": "car", "color": "#123456"}).json()
    child = auth_client.post("/api/categories", json={"name": "Recarga", "kind": "expense", "parent_id": parent["id"]}).json()
    assert child["parent_id"] == parent["id"]
    # tercer nivel no permitido
    r = auth_client.post("/api/categories", json={"name": "Nivel 3", "kind": "expense", "parent_id": child["id"]})
    assert r.status_code == 422
    # tipos distintos no permitidos
    r = auth_client.post("/api/categories", json={"name": "Mal", "kind": "income", "parent_id": parent["id"]})
    assert r.status_code == 422
    assert auth_client.delete(f"/api/categories/{parent['id']}").status_code == 409
    assert auth_client.delete(f"/api/categories/{child['id']}").status_code == 204
    assert auth_client.patch(f"/api/categories/{parent['id']}", json={"color": "#ff0000"}).json()["color"] == "#ff0000"


def test_etiquetas_duplicadas(auth_client):
    assert auth_client.post("/api/tags", json={"name": "Viaje"}).status_code == 201
    assert auth_client.post("/api/tags", json={"name": "viaje"}).status_code == 409


def test_flujo_recurrente_por_api(auth_client, make_account, cat):
    acc = make_account(initial="1000")
    body = {
        "name": "Luz", "kind": "expense", "start_date": "2026-05-12", "include_past": True,
        "terms": {"frequency": "monthly", "amount": "60.00", "amount_mode": "variable",
                  "account_id": acc.id, "category_id": cat("Luz"), "concept": "Iberdrola"},
    }
    r = auth_client.post("/api/recurring", json=body)
    assert r.status_code == 201, r.text
    series = r.json()
    assert series["pending_count"] == 2  # mayo y junio vencidos sin confirmar (variable)
    assert series["next_occurrence"]["due_date"] == "2026-07-12"

    pending = auth_client.get("/api/occurrences", params={"status": "planned", "date_to": "2026-06-15"}).json()
    assert [o["due_date"] for o in pending] == ["2026-05-12", "2026-06-12"]
    r = auth_client.post(f"/api/occurrences/{pending[0]['id']}/confirm", json={"amount": "71.40"})
    assert r.json()["status"] == "confirmed" and r.json()["actual_amount"] == "71.40"
    assert auth_client.get(f"/api/accounts/{acc.id}").json()["balance"] == "928.60"

    tx = auth_client.get(f"/api/transactions/{r.json()['transaction_id']}").json()
    assert tx["series_id"] == series["id"] and tx["concept"] == "Iberdrola"

    r = auth_client.post(f"/api/recurring/{series['id']}/versions", json={
        "effective_from": "2026-08-12", "terms": {**body["terms"], "amount": "75.00"}})
    detail = r.json()
    assert [v["amount"] for v in detail["versions"]] == ["60.00", "75.00"]
    assert {o["expected_amount"] for o in detail["occurrences"] if o["scheduled_date"] >= "2026-08-12"} == {"75.00"}

    assert auth_client.get("/api/recurring").json()[0]["current"]["amount"] == "60.00"
    assert auth_client.delete(f"/api/recurring/{series['id']}").status_code == 204
    assert auth_client.get(f"/api/transactions/{tx['id']}").json()["series_id"] is None


def test_importes_como_cadena_sin_perder_precision(auth_client, make_account, expense_cat):
    acc = make_account()
    for _ in range(3):
        auth_client.post("/api/transactions", json={
            "kind": "expense", "amount": "0.10", "date": "2026-06-01", "concept": "Café",
            "category_id": expense_cat, "account_id": acc.id,
        })
    assert Decimal(auth_client.get(f"/api/accounts/{acc.id}").json()["balance"]) == Decimal("-0.30")
