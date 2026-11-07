"""Varios usuarios: cada uno con sus propias finanzas."""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.models import Account, AccountType, Category, Tag, Transaction, TransactionKind
from app.seed.demo import seed_demo
from app.services import data_io
from app.services.balances import account_balances
from app.services.bootstrap import run_jobs
from app.services.users import create_user
from app.tenancy import NoCurrentUser, as_user, current_user_id, set_current_user
from tests.conftest import TODAY


def login(client, username, password):
    r = client.post("/api/auth/login", json={"username": username, "password": password})
    assert r.status_code == 200, r.text


def count(db, model) -> int:
    return db.scalar(select(func.count()).select_from(model))


def test_crear_usuario_desde_la_app(auth_client, db):
    r = auth_client.post("/api/users", json={"username": "Ana", "password": "otraclave1"})
    assert r.status_code == 201 and r.json()["username"] == "Ana"
    assert [u["username"] for u in auth_client.get("/api/users").json()] == ["Ana", "Ronald"]

    # Duplicado (sin distinguir mayúsculas) y contraseña corta
    assert auth_client.post("/api/users", json={"username": "ana", "password": "otraclave1"}).status_code == 409
    r = auth_client.post("/api/users", json={"username": "Luis", "password": "corta"})
    assert r.status_code == 422 and "contraseña" in r.json()["detail"]

    # Ana entra con su contraseña y empieza con las categorías iniciales y nada más
    login(auth_client, "Ana", "otraclave1")
    assert auth_client.get("/api/auth/me").json()["username"] == "Ana"
    assert len(auth_client.get("/api/categories").json()) > 20
    assert auth_client.get("/api/accounts").json() == []


def test_registro_desde_la_pantalla_de_entrada(client, db, monkeypatch):
    from app import config

    assert client.get("/api/auth/options").json() == {"registration_open": True, "has_users": True}
    r = client.post("/api/auth/register", json={"username": "Luis", "password": "clave-luis1"})
    assert r.status_code == 201 and r.json()["username"] == "Luis"
    # Queda con la sesión iniciada y con sus propias finanzas
    assert client.get("/api/auth/me").json()["username"] == "Luis"
    assert client.get("/api/accounts").json() == []
    assert len(client.get("/api/categories").json()) > 20

    assert client.post("/api/auth/register", json={"username": "luis", "password": "clave-luis1"}).status_code == 409
    assert client.post("/api/auth/register", json={"username": "Eva", "password": "corta"}).status_code == 422

    # Freno a la creación masiva desde la misma dirección
    for i in range(4):
        assert client.post("/api/auth/register", json={"username": f"bot{i}", "password": "clave-bot1"}).status_code == 201
    assert client.post("/api/auth/register", json={"username": "bot9", "password": "clave-bot1"}).status_code == 429

    # Registro desactivado en .env
    monkeypatch.setattr(config.get_settings(), "allow_registration", False)
    assert client.get("/api/auth/options").json() == {"registration_open": False, "has_users": True}
    assert client.post("/api/auth/register", json={"username": "Otra", "password": "clave-otra1"}).status_code == 403


def _sin_usuarios(db):
    from sqlalchemy import delete, text

    from app.models import User

    db.execute(text("SET LOCAL session_replication_role = replica"))  # sin comprobar claves ajenas
    db.execute(delete(User))
    db.execute(text("SET LOCAL session_replication_role = DEFAULT"))
    db.commit()


def test_instalacion_nueva_sin_usuario_inicial(client, db, monkeypatch):
    """Sin ADMIN_USERNAME/ADMIN_PASSWORD no se crea nadie y la primera cuenta se crea desde la pantalla de entrada."""
    from app import config
    from app.models import User
    from app.services.bootstrap import ensure_admin_user

    _sin_usuarios(db)
    monkeypatch.setattr(config.get_settings(), "admin_username", "")
    monkeypatch.setattr(config.get_settings(), "admin_password", "")
    ensure_admin_user(db)
    assert count(db, User) == 0

    # Aunque el registro esté desactivado, la primera cuenta se puede crear
    monkeypatch.setattr(config.get_settings(), "allow_registration", False)
    assert client.get("/api/auth/options").json() == {"registration_open": True, "has_users": False}
    assert client.post("/api/auth/register", json={"username": "Marta", "password": "clave-marta1"}).status_code == 201
    assert client.get("/api/auth/options").json() == {"registration_open": False, "has_users": True}
    assert client.post("/api/auth/register", json={"username": "Otra", "password": "clave-otra1"}).status_code == 403


def test_usuario_inicial_desde_env(db, monkeypatch):
    from app import config
    from app.models import User
    from app.services.bootstrap import ensure_admin_user
    from app.services.users import find_user

    _sin_usuarios(db)
    monkeypatch.setattr(config.get_settings(), "admin_username", "Marta")
    monkeypatch.setattr(config.get_settings(), "admin_password", "clave-marta1")
    ensure_admin_user(db)
    ensure_admin_user(db)  # solo la primera vez
    assert count(db, User) == 1 and find_user(db, "marta") is not None


def test_cada_usuario_ve_solo_lo_suyo(auth_client, db, make_account, expense_cat):
    acc = make_account("Banco de Ronald", initial="1000")
    tx = auth_client.post("/api/transactions", json={
        "kind": "expense", "amount": "40", "date": "2026-06-10", "concept": "Mercadona",
        "category_id": expense_cat, "account_id": acc.id,
    }).json()
    auth_client.post("/api/users", json={"username": "Ana", "password": "otraclave1"})

    login(auth_client, "Ana", "otraclave1")
    assert auth_client.get("/api/accounts").json() == []
    assert auth_client.get("/api/transactions").json()["total"] == 0
    assert auth_client.get(f"/api/transactions/{tx['id']}").status_code == 404
    assert auth_client.get(f"/api/accounts/{acc.id}").status_code == 404
    assert auth_client.delete(f"/api/transactions/{tx['id']}").status_code == 404
    assert Decimal(auth_client.get("/api/reports/dashboard").json()["total_balance"]) == 0
    # Tampoco puede usar la cuenta de otro en sus movimientos
    r = auth_client.post("/api/transactions", json={
        "kind": "income", "amount": "5", "date": "2026-06-10", "concept": "Intruso", "account_id": acc.id,
    })
    assert r.status_code in (404, 422)

    ana_acc = auth_client.post("/api/accounts", json={
        "name": "Banco de Ana", "type": "bank", "initial_balance": "50", "initial_balance_date": "2026-01-01",
    }).json()
    assert [a["name"] for a in auth_client.get("/api/accounts").json()] == ["Banco de Ana"]

    login(auth_client, "Ronald", "secreto123")
    assert [a["name"] for a in auth_client.get("/api/accounts").json()] == ["Banco de Ronald"]
    assert auth_client.get(f"/api/accounts/{ana_acc['id']}").status_code == 404
    assert Decimal(auth_client.get("/api/reports/dashboard").json()["total_balance"]) == Decimal("960")


def test_saldos_y_subconsultas_filtradas(db, make_account):
    """Los informes usan subconsultas (uniones de movimientos): también deben filtrarse."""
    ronald = current_user_id(db)
    acc = make_account(initial="100")
    db.add(Transaction(kind=TransactionKind.INCOME, amount=Decimal("10"), date=TODAY, concept="x", account_id=acc.id))
    db.commit()
    ana = create_user(db, "Ana", "otraclave1")
    with as_user(db, ana.id):
        other = Account(name="De Ana", type=AccountType.CASH, initial_balance=Decimal("7"), initial_balance_date=TODAY)
        db.add(other)
        db.commit()
        db.add(Transaction(kind=TransactionKind.EXPENSE, amount=Decimal("3"), date=TODAY, concept="y", account_id=other.id))
        db.commit()
        assert account_balances(db) == {other.id: Decimal("4")}
    assert current_user_id(db) == ronald
    assert account_balances(db) == {acc.id: Decimal("110")}


def test_sin_usuario_no_se_consulta_nada(db):
    db.info.pop("user_id")
    with pytest.raises(NoCurrentUser):
        db.scalars(select(Account)).all()
    with pytest.raises(NoCurrentUser):
        db.add(Tag(name="huérfana"))
        db.flush()
    db.rollback()


def test_misma_etiqueta_en_dos_usuarios(db):
    db.add(Tag(name="Vacaciones"))
    db.commit()
    ana = create_user(db, "Ana", "otraclave1")
    with as_user(db, ana.id):
        db.add(Tag(name="Vacaciones"))
        db.commit()
        assert count(db, Tag) == 1
    assert count(db, Tag) == 1


def test_importar_en_otro_usuario_no_toca_al_primero(db):
    seed_demo(db, TODAY)
    exported = data_io.export_data(db)
    ronald_tx = count(db, Transaction)

    ana = create_user(db, "Ana", "otraclave1")
    with as_user(db, ana.id):
        data_io.import_data(db, exported)
        assert count(db, Transaction) == ronald_tx
        ana_ids = set(db.scalars(select(Transaction.id)))
        # Y volver a importar en Ana sustituye lo suyo, sin duplicar
        data_io.import_data(db, exported)
        assert count(db, Transaction) == ronald_tx
    assert count(db, Transaction) == ronald_tx
    assert not ana_ids & set(db.scalars(select(Transaction.id)))
    set_current_user(db, ana.id)
    assert count(db, Category) == len(exported["tables"]["categories"])


def test_tareas_periodicas_de_todos_los_usuarios(db, make_account, expense_cat):
    from tests.test_reports import series

    series(db, make_account(), expense_cat, "Gimnasio de Ronald", "30", date(2026, 5, 1), include_past=True)
    ana = create_user(db, "Ana", "otraclave1")
    with as_user(db, ana.id):
        acc = Account(name="De Ana", type=AccountType.BANK, initial_balance=Decimal("0"), initial_balance_date=TODAY)
        db.add(acc)
        db.commit()
        cat = db.scalar(select(Category.id).where(Category.name == "Supermercado"))
        series(db, acc, cat, "Gimnasio de Ana", "20", date(2026, 5, 1), include_past=True)

    run_jobs(db)
    concepts = set(db.scalars(select(Transaction.concept)))
    assert concepts == {"Gimnasio de Ronald"}
    with as_user(db, ana.id):
        assert set(db.scalars(select(Transaction.concept))) == {"Gimnasio de Ana"}


def test_festivos_al_crear_la_cuenta(client, db):
    regions = client.get("/api/auth/holiday-regions").json()
    es = next(c for c in regions["countries"] if c["code"] == "ES")
    assert {"code": "VC", "name": "Comunitat Valenciana"} in es["subdivisions"]
    assert {"code": "MD", "name": "Madrid"} in es["subdivisions"]
    assert regions["default_country"] == "ES"

    # Región no válida: no se crea la cuenta
    r = client.post("/api/auth/register", json={"username": "Pau", "password": "clave-pau1", "holidays_country": "ES", "holidays_subdiv": "ZZ"})
    assert r.status_code == 422
    r = client.post("/api/auth/register", json={"username": "Pau", "password": "clave-pau1", "holidays_country": "fr", "holidays_subdiv": ""})
    assert r.status_code == 201
    s = client.get("/api/settings").json()
    assert (s["holidays_country"], s["holidays_subdiv"]) == ("FR", None)

    # Sin indicarlos, los de la instalación
    client.post("/api/auth/register", json={"username": "Eva", "password": "clave-eva1"})
    s = client.get("/api/settings").json()
    assert (s["holidays_country"], s["holidays_subdiv"]) == ("ES", "VC")
