import os
from datetime import date
from decimal import Decimal

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session

from app import config
from app.db import get_db
from app.main import app
from app.models import Account, AccountType, Category, CategoryKind, User
from app.security import hash_password
from app.seed.categories import seed_default_categories
from app.tenancy import set_current_user

TODAY = date(2026, 6, 15)
TEST_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://finanzas:finanzas@db:5432/finanzas_test"
)


@pytest.fixture(scope="session")
def engine():
    url = make_url(TEST_URL)
    admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    with admin.connect() as conn:
        conn.execute(text(f'DROP DATABASE IF EXISTS "{url.database}" WITH (FORCE)'))
        conn.execute(text(f'CREATE DATABASE "{url.database}"'))
    admin.dispose()

    eng = create_engine(url)
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
    cfg.attributes["database_url"] = TEST_URL
    command.upgrade(cfg, "head")
    yield eng
    eng.dispose()


@pytest.fixture
def db(engine):
    """Sesión dentro de una transacción que se deshace al acabar cada test."""
    conn = engine.connect()
    trans = conn.begin()
    session = Session(bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False)
    user = User(username="Ronald", password_hash=hash_password("secreto123"))
    session.add(user)
    session.commit()
    set_current_user(session, user.id)
    seed_default_categories(session)
    yield session
    session.close()
    trans.rollback()
    conn.close()


@pytest.fixture(autouse=True)
def _reset_auth_limits():
    from app.api.routes import auth

    auth._failures.clear()
    auth._registrations.clear()


@pytest.fixture(autouse=True)
def _settings(monkeypatch, tmp_path):
    settings = config.get_settings()
    monkeypatch.setattr(settings, "attachments_dir", str(tmp_path / "attachments"))
    monkeypatch.setattr(settings, "occurrence_horizon_months", 18)
    monkeypatch.setattr(settings, "holidays_country", "ES")
    monkeypatch.setattr(settings, "holidays_subdiv", "VC")
    monkeypatch.setattr(config, "today", lambda: TODAY)


@pytest.fixture
def client(db):
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
def auth_client(client, db):
    r = client.post("/api/auth/login", json={"username": "Ronald", "password": "secreto123"})
    assert r.status_code == 200, r.text
    return client


@pytest.fixture
def make_account(db):
    def _make(name="Banco", type_=AccountType.BANK, initial="0.00") -> Account:
        acc = Account(name=name, type=type_, initial_balance=Decimal(initial), initial_balance_date=date(2026, 1, 1))
        db.add(acc)
        db.commit()
        return acc

    return _make


@pytest.fixture
def cat(db):
    """Id de una categoría del conjunto inicial por nombre."""

    def _get(name: str) -> int:
        return db.scalar(select(Category.id).where(Category.name == name))

    return _get


@pytest.fixture
def expense_cat(cat):
    return cat("Supermercado")


@pytest.fixture
def income_cat(db):
    return db.scalar(select(Category.id).where(Category.kind == CategoryKind.INCOME, Category.name == "Nómina"))
