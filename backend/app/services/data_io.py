"""Exportación e importación de los datos de un usuario en JSON.

El fichero contiene todas las tablas de datos del usuario actual (no el usuario ni su
contraseña) y, opcionalmente, los adjuntos en base64. La importación sustituye solo los datos
de ese usuario, en una única transacción: o se importa todo o no cambia nada. Los datos de los
demás usuarios no se tocan.

Los ids del fichero no se conservan: cada fila recibe uno nuevo (en el mismo orden) y las
referencias entre tablas se traducen, para que el fichero se pueda importar en cualquier
usuario o instalación sin chocar con lo que ya hay.

Compatibilidad: al importar, las columnas que no existan en el fichero (exportado con una
versión anterior de la app) toman su valor por defecto, y las que sobren se ignoran.
"""

import base64
import binascii
import hashlib
from datetime import UTC, date, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from typing import Any

import uuid

from sqlalchemy import Boolean, Column, Date, DateTime, Integer, Numeric, Table, delete, func, insert, select, text
from sqlalchemy.orm import Session

import app.models  # noqa: F401  (registra todas las tablas)
from app.db import Base
from app.services import attachments as att_files
from app.services.errors import Invalid
from app.tenancy import current_user_id

FORMAT = "finanzas-export"
FORMAT_VERSION = 1
EXCLUDED_TABLES = {"users"}
OWNER = "user_id"


def data_tables() -> list[Table]:
    """Tablas en orden de dependencias (las referenciadas primero)."""
    return [t for t in Base.metadata.sorted_tables if t.name not in EXCLUDED_TABLES]


def _owner_filter(table: Table, user_id: int):
    """Condición que deja solo las filas del usuario. Las tablas de enlace (etiquetas de un
    movimiento...) no tienen dueño propio: son del usuario si lo es la fila a la que apuntan."""
    if OWNER in table.c:
        return table.c[OWNER] == user_id
    for fk in table.foreign_keys:
        parent = fk.column.table
        if OWNER in parent.c:
            return fk.parent.in_(select(fk.column).where(parent.c[OWNER] == user_id))
    raise AssertionError(f"La tabla {table.name} no se puede asociar a un usuario")


def _schema_revision(db: Session) -> str | None:
    return db.execute(text("SELECT version_num FROM alembic_version")).scalar()


def _dump_value(value: Any) -> Any:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return value


def _load_value(column: Column, value: Any) -> Any:
    if value is None:
        return None
    try:
        if isinstance(column.type, Numeric):
            return Decimal(str(value))
        if isinstance(column.type, DateTime):
            return datetime.fromisoformat(value)
        if isinstance(column.type, Date):
            return date.fromisoformat(value)
        if isinstance(column.type, Boolean):
            if not isinstance(value, bool):
                raise ValueError
            return value
        if isinstance(column.type, Integer):
            if isinstance(value, bool) or not isinstance(value, int):
                raise ValueError
            return value
    except (ValueError, TypeError, InvalidOperation) as e:
        raise Invalid(f"Valor no válido en {column.table.name}.{column.name}: {value!r}") from e
    return value


def export_data(db: Session, include_attachments: bool = True) -> dict:
    user_id = current_user_id(db)
    tables = {}
    counts = {}
    for table in data_tables():
        order = [c for c in table.primary_key.columns]
        rows = db.execute(select(table).where(_owner_filter(table, user_id)).order_by(*order)).mappings().all()
        tables[table.name] = [{k: _dump_value(v) for k, v in row.items() if k != OWNER} for row in rows]
        counts[table.name] = len(rows)

    files = {}
    missing = []
    if include_attachments:
        for row in tables.get("attachments", []):
            path = att_files.storage_root() / row["storage_name"]
            if path.is_file():
                files[row["storage_name"]] = base64.b64encode(path.read_bytes()).decode("ascii")
            else:
                missing.append(row["storage_name"])

    return {
        "format": FORMAT,
        "version": FORMAT_VERSION,
        "schema_revision": _schema_revision(db),
        "exported_at": datetime.now(UTC).isoformat(),
        "counts": counts,
        "includes_attachments": include_attachments,
        "missing_attachment_files": missing,
        "tables": tables,
        "files": files,
    }


def _validate(payload: Any) -> dict:
    if not isinstance(payload, dict) or payload.get("format") != FORMAT:
        raise Invalid("El fichero no es una exportación de esta aplicación")
    if payload.get("version") != FORMAT_VERSION:
        raise Invalid(f"Versión de exportación no compatible ({payload.get('version')})")
    if not isinstance(payload.get("tables"), dict):
        raise Invalid("El fichero está incompleto: falta la sección de datos")
    known = {t.name for t in data_tables()}
    unknown = set(payload["tables"]) - known
    if unknown:
        raise Invalid(
            "El fichero tiene datos que esta versión de la app no conoce "
            f"({', '.join(sorted(unknown))}). Actualiza la app antes de importarlo."
        )
    for name, rows in payload["tables"].items():
        if not isinstance(rows, list) or not all(isinstance(r, dict) for r in rows):
            raise Invalid(f"La tabla {name} del fichero no es válida")
    return payload


def _prepare_rows(table: Table, rows: list[dict]) -> list[dict]:
    prepared = []
    for raw in rows:
        row = {}
        for column in table.columns:
            if column.name == OWNER:
                continue  # se pone al importar: el del usuario actual
            if column.name in raw:
                row[column.name] = _load_value(column, raw[column.name])
            elif column.server_default is not None:
                continue  # la base de datos pone su valor por defecto
            elif column.default is not None and column.default.is_scalar:
                row[column.name] = column.default.arg
            elif column.nullable:
                row[column.name] = None
            else:
                raise Invalid(f"Falta el dato obligatorio {table.name}.{column.name} en el fichero")
        prepared.append(row)
    # Tablas que se referencian a sí mismas (categorías → categoría padre): primero las raíces.
    if "parent_id" in table.columns:
        prepared.sort(key=lambda r: r.get("parent_id") is not None)
    return prepared


def _decode_files(payload: dict) -> dict[str, bytes]:
    files = payload.get("files") or {}
    if not isinstance(files, dict):
        raise Invalid("La sección de adjuntos del fichero no es válida")
    hashes = {r.get("storage_name"): r.get("sha256") for r in payload["tables"].get("attachments", [])}
    decoded = {}
    for name, data in files.items():
        if name not in hashes or ".." in Path(name).parts or Path(name).is_absolute():
            raise Invalid(f"Adjunto no esperado en el fichero: {name}")
        try:
            content = base64.b64decode(data, validate=True)
        except (binascii.Error, TypeError) as e:
            raise Invalid(f"El adjunto {name} está dañado") from e
        if hashlib.sha256(content).hexdigest() != hashes[name]:
            raise Invalid(f"El adjunto {name} está dañado (no coincide su huella)")
        decoded[name] = content
    return decoded


def _renumber(db: Session, tables: list[Table], prepared: dict[str, list[dict]], user_id: int) -> dict[str, str]:
    """Ids nuevos para todas las filas (conservando su orden) y referencias traducidas.

    Devuelve el cambio de nombre de los ficheros de adjuntos, que también deben ser únicos.
    """
    new_ids: dict[str, dict[int, int]] = {}
    for table in tables:
        id_col = table.columns.get("id")
        rows = prepared[table.name]
        if id_col is None or not isinstance(id_col.type, Integer) or not rows:
            continue
        old = sorted({r["id"] for r in rows})
        seq = func.nextval(func.pg_get_serial_sequence(table.name, "id"))
        fresh = db.execute(select(seq).select_from(func.generate_series(1, len(old)))).scalars().all()
        new_ids[table.name] = dict(zip(old, sorted(fresh), strict=True))

    renamed_files: dict[str, str] = {}
    for table in tables:
        fks = [(fk.parent.name, fk.column.table.name) for fk in table.foreign_keys if fk.column.name == "id"]
        for row in prepared[table.name]:
            if "id" in row and table.name in new_ids:
                row["id"] = new_ids[table.name][row["id"]]
            for column, target in fks:
                value = row.get(column)
                if value is None:
                    continue
                if value not in new_ids.get(target, {}):
                    raise Invalid(
                        "Los datos del fichero no son coherentes y no se ha importado nada "
                        f"({table.name}.{column} apunta a una fila de {target} que no está en el fichero: {value})"
                    )
                row[column] = new_ids[target][value]
            if OWNER in table.c:
                row[OWNER] = user_id
            if table.name == "attachments":
                old_name = row["storage_name"]
                new_name = f"{Path(old_name).parent.as_posix()}/{uuid.uuid4().hex}{Path(old_name).suffix}".lstrip("./")
                renamed_files[old_name] = new_name
                row["storage_name"] = new_name
    return renamed_files


def import_data(db: Session, payload: Any, dry_run: bool = False) -> dict:
    """Sustituye los datos del usuario actual por los del fichero. Con `dry_run` solo valida y cuenta."""
    user_id = current_user_id(db)
    payload = _validate(payload)
    files = _decode_files(payload)
    tables = data_tables()
    prepared = {t.name: _prepare_rows(t, payload["tables"].get(t.name, [])) for t in tables}
    counts = {name: len(rows) for name, rows in prepared.items()}
    summary = {
        "counts": counts,
        "schema_revision": payload.get("schema_revision"),
        "exported_at": payload.get("exported_at"),
        "attachment_files": len(files),
        "dry_run": dry_run,
    }

    root = att_files.storage_root()
    attachments = next(t for t in tables if t.name == "attachments")
    # Solo los ficheros de este usuario: los adjuntos de los demás no se tocan.
    previous_files = set(db.execute(select(attachments.c.storage_name).where(_owner_filter(attachments, user_id))).scalars())
    written: list[str] = []
    savepoint = db.begin_nested()
    try:
        for table in reversed(tables):
            db.execute(delete(table).where(_owner_filter(table, user_id)))
        renamed = _renumber(db, tables, prepared, user_id)
        for table in tables:
            if prepared[table.name]:
                db.execute(insert(table), prepared[table.name])
        db.flush()
    except Invalid:
        savepoint.rollback()
        raise
    except Exception as e:  # restricciones de la base de datos: el fichero no es coherente
        savepoint.rollback()
        reason = str(getattr(e, "orig", e)).splitlines()[0]
        raise Invalid(f"Los datos del fichero no son coherentes y no se ha importado nada ({reason})") from e

    if dry_run:
        savepoint.rollback()
        return summary

    savepoint.commit()
    try:
        for name, content in files.items():
            target = renamed.get(name, name)
            path = root / target
            path.parent.mkdir(parents=True, exist_ok=True)
            written.append(target)
            path.write_bytes(content)
        db.commit()
    except Exception:
        db.rollback()
        for name in written:
            (root / name).unlink(missing_ok=True)
        raise

    # Los adjuntos que este usuario tenía antes de importar ya no corresponden a ningún dato.
    for name in previous_files:
        (root / name).unlink(missing_ok=True)
    db.expire_all()
    return summary
