"""Exportación e importación completa en JSON."""

import base64
import copy
import hashlib
import json
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.models import Account, Attachment, Transaction, TransactionKind, User
from app.seed.demo import seed_demo
from app.services import data_io
from app.services.errors import Invalid
from tests.conftest import TODAY


def canonical(data: dict) -> dict:
    """Exportación comparable aunque los ids hayan cambiado: cada id pasa a ser su posición
    (la importación conserva el orden) y los ficheros se identifican por su huella."""
    data = copy.deepcopy(data)
    data.pop("exported_at", None)
    ranks = {}
    for table in data_io.data_tables():
        rows = data["tables"].get(table.name, [])
        if rows and "id" in rows[0]:
            ranks[table.name] = {old: i for i, old in enumerate(sorted(r["id"] for r in rows), 1)}
    for table in data_io.data_tables():
        fks = [(fk.parent.name, fk.column.table.name) for fk in table.foreign_keys if fk.column.table.name in ranks]
        for row in data["tables"].get(table.name, []):
            if table.name in ranks:
                row["id"] = ranks[table.name][row["id"]]
            for column, target in fks:
                if row.get(column) is not None:
                    row[column] = ranks[target][row[column]]
            row.pop("storage_name", None)
        data["tables"][table.name] = sorted(data["tables"].get(table.name, []), key=lambda r: json.dumps(r, sort_keys=True))
    data["files"] = sorted(hashlib.sha256(base64.b64decode(c)).hexdigest() for c in data.get("files", {}).values())
    return data


def snapshot(db) -> dict:
    """Exportación sin lo que cambia al importar (ids, nombres de ficheros), para comparar."""
    return canonical(data_io.export_data(db))


def count(db, model) -> int:
    return db.scalar(select(func.count()).select_from(model))


@pytest.fixture
def demo(db):
    seed_demo(db, TODAY)
    return db


def test_ida_y_vuelta(demo):
    db = demo
    original = data_io.export_data(db)
    original.pop("exported_at")
    assert original["counts"]["transactions"] > 150 and original["counts"]["budgets"] == 4
    assert "users" not in original["tables"]  # el usuario y su contraseña no se exportan

    # Se estropean datos y se importa la copia
    db.execute(Transaction.__table__.delete().where(Transaction.kind == TransactionKind.EXPENSE))
    db.add(Account(name="Cuenta nueva", type="cash", initial_balance=Decimal("5"), initial_balance_date=TODAY))
    db.commit()
    summary = data_io.import_data(db, json.loads(json.dumps(original)))
    assert summary["counts"]["transactions"] == original["counts"]["transactions"]
    db.expire_all()
    assert snapshot(db) == canonical(original)  # idéntico: importes, fechas, relaciones...

    # Las secuencias siguen detrás del máximo id: se pueden crear datos nuevos
    tx = Transaction(kind=TransactionKind.INCOME, amount=Decimal("1"), date=TODAY, concept="tras importar",
                     account_id=db.scalar(select(Account.id).limit(1)))
    db.add(tx)
    db.commit()
    assert tx.id > max(r["id"] for r in original["tables"]["transactions"])


def test_comprobar_no_cambia_nada(demo):
    db = demo
    before = snapshot(db)
    other = data_io.export_data(db)
    other["tables"]["transactions"] = other["tables"]["transactions"][:10]
    other["tables"]["transaction_tags"] = [r for r in other["tables"]["transaction_tags"]
                                          if r["transaction_id"] in {t["id"] for t in other["tables"]["transactions"]}]
    other["tables"]["attachments"] = []
    summary = data_io.import_data(db, other, dry_run=True)
    assert summary["dry_run"] and summary["counts"]["transactions"] == 10
    db.expire_all()
    assert snapshot(db) == before


def test_el_usuario_no_se_toca(demo, db):
    data_io.import_data(db, data_io.export_data(db))
    assert count(db, User) == 1


def test_compatible_con_exportaciones_antiguas(demo):
    db = demo
    data = data_io.export_data(db)
    for row in data["tables"]["transactions"]:
        del row["is_deductible"]  # columna que una versión anterior no tendría
        del row["created_at"]  # con valor por defecto en la base de datos
        row["columna_futura_ignorada"] = 1
    data["tables"]["budgets"] = []
    data["tables"]["budget_overrides"] = []
    data_io.import_data(db, data)
    assert count(db, Transaction) == len(data["tables"]["transactions"])
    assert db.scalar(select(func.bool_or(Transaction.is_deductible))) is False


@pytest.mark.parametrize(
    ("mutate", "message"),
    [
        (lambda d: d.update(format="otra-cosa"), "no es una exportación"),
        (lambda d: d.update(version=99), "no compatible"),
        (lambda d: d["tables"].update(tabla_desconocida=[]), "Actualiza la app"),
        (lambda d: d["tables"]["transactions"][0].update(amount="mucho"), "Valor no válido"),
        (lambda d: d["tables"]["transactions"][0].update(account_id=99999), "no son coherentes"),
        (lambda d: d["tables"]["accounts"][0].pop("name"), "Falta el dato obligatorio"),
    ],
)
def test_ficheros_no_validos_no_cambian_nada(demo, mutate, message):
    db = demo
    before = snapshot(db)
    data = copy.deepcopy(data_io.export_data(db))
    mutate(data)
    with pytest.raises(Invalid, match=message):
        data_io.import_data(db, data)
    db.expire_all()
    assert snapshot(db) == before


def test_adjuntos(auth_client, db, make_account, expense_cat):
    acc = make_account()
    tx = auth_client.post("/api/transactions", json={
        "kind": "expense", "amount": "12.30", "date": "2026-06-01", "concept": "Farmacia",
        "category_id": expense_cat, "account_id": acc.id,
    }).json()
    pdf = b"%PDF-1.4 ticket de la farmacia"
    auth_client.post(f"/api/transactions/{tx['id']}/attachments", files={"file": ("ticket.pdf", pdf, "application/pdf")})

    r = auth_client.get("/api/data/export")
    assert r.status_code == 200 and "attachment; filename=" in r.headers["content-disposition"]
    exported = r.json()
    (name, content), = exported["files"].items()
    assert base64.b64decode(content) == pdf
    assert "files" in auth_client.get("/api/data/export", params={"include_attachments": False}).json()

    # Adjunto dañado: se rechaza
    broken = copy.deepcopy(exported)
    broken["files"][name] = base64.b64encode(b"otra cosa").decode()
    r = auth_client.post("/api/data/import", files={"file": ("x.json", json.dumps(broken), "application/json")})
    assert r.status_code == 422 and "dañado" in r.json()["detail"]

    # Se borra el movimiento (y su fichero) y se recupera importando
    auth_client.delete(f"/api/transactions/{tx['id']}")
    assert count(db, Attachment) == 0
    r = auth_client.post("/api/data/import", params={"dry_run": True}, files={"file": ("x.json", json.dumps(exported), "application/json")})
    assert r.json()["dry_run"] and count(db, Attachment) == 0
    r = auth_client.post("/api/data/import", files={"file": ("x.json", json.dumps(exported), "application/json")})
    assert r.status_code == 200 and r.json()["attachment_files"] == 1
    restored = auth_client.get("/api/transactions", params={"q": "Farmacia"}).json()["items"][0]
    assert restored["id"] != tx["id"]  # los ids se renumeran al importar
    att = restored["attachments"][0]
    assert auth_client.get(f"/api/attachments/{att['id']}").content == pdf


def test_json_no_valido(auth_client):
    r = auth_client.post("/api/data/import", files={"file": ("x.json", b"{no es json", "application/json")})
    assert r.status_code == 422 and "JSON" in r.json()["detail"]


def test_importacion_pone_al_dia_los_recurrentes(auth_client, db, make_account, cat):
    """Una copia antigua se importa y se generan las ocurrencias hasta el horizonte actual."""
    acc = make_account()
    auth_client.post("/api/recurring", json={
        "name": "Alquiler", "kind": "expense", "start_date": "2026-07-01",
        "terms": {"frequency": "monthly", "amount": "700", "account_id": acc.id, "category_id": cat("Alquiler"), "concept": "Alquiler"},
    })
    exported = auth_client.get("/api/data/export").json()
    exported["tables"]["occurrences"] = exported["tables"]["occurrences"][:2]
    r = auth_client.post("/api/data/import", files={"file": ("x.json", json.dumps(exported), "application/json")})
    assert r.status_code == 200
    series = auth_client.get("/api/recurring").json()[0]
    occs = auth_client.get(f"/api/recurring/{series['id']}").json()["occurrences"]
    assert len(occs) == 18 and occs[-1]["scheduled_date"] == str(date(2027, 12, 1))
