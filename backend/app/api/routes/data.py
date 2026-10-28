import json
from datetime import datetime

from fastapi import APIRouter, UploadFile
from fastapi.responses import Response

from app.api.deps import DB, Today
from app.services import data_io
from app.services.errors import Invalid
from app.services.recurring import sync_all

router = APIRouter(prefix="/data", tags=["data"])

MAX_IMPORT_MB = 60


@router.get("/export")
def export(db: DB, include_attachments: bool = True):
    """Descarga todos los datos en un fichero JSON."""
    payload = data_io.export_data(db, include_attachments)
    name = f"finanzas_{datetime.now().strftime('%Y%m%d_%H%M')}.json"
    return Response(
        content=json.dumps(payload, ensure_ascii=False, indent=1),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{name}"'},
    )


@router.post("/import")
def import_(file: UploadFile, db: DB, today: Today, dry_run: bool = False):
    """Sustituye todos los datos por los del fichero. Con `dry_run=true` solo lo comprueba."""
    raw = file.file.read(MAX_IMPORT_MB * 1024 * 1024 + 1)
    if len(raw) > MAX_IMPORT_MB * 1024 * 1024:
        raise Invalid(f"El fichero supera {MAX_IMPORT_MB} MB")
    try:
        payload = json.loads(raw)
    except (json.JSONDecodeError, UnicodeDecodeError) as e:
        raise Invalid("El fichero no es un JSON válido") from e
    summary = data_io.import_data(db, payload, dry_run=dry_run)
    if not dry_run:
        # Pone al día los recurrentes (horizonte y autoconfirmaciones) con la fecha de hoy.
        sync_all(db, today)
    return summary
