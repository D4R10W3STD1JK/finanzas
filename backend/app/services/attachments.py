import hashlib
import uuid
from pathlib import Path

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Attachment, Transaction
from app.services.errors import Invalid

ALLOWED_TYPES = {
    "application/pdf": ".pdf",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/heic": ".heic",
    "image/heif": ".heif",
}


def storage_root() -> Path:
    return Path(get_settings().attachments_dir)


def attachment_path(att: Attachment) -> Path:
    return storage_root() / att.storage_name


def save_attachment(db: Session, tx: Transaction, upload: UploadFile) -> Attachment:
    mime = (upload.content_type or "").lower()
    if mime not in ALLOWED_TYPES:
        raise Invalid("Tipo de archivo no permitido: solo PDF o imágenes (JPG, PNG, WEBP, HEIC)")
    max_bytes = get_settings().max_attachment_mb * 1024 * 1024
    data = upload.file.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise Invalid(f"El archivo supera el tamaño máximo de {get_settings().max_attachment_mb} MB")
    if not data:
        raise Invalid("El archivo está vacío")

    storage_name = f"{tx.date.year}/{uuid.uuid4().hex}{ALLOWED_TYPES[mime]}"
    path = storage_root() / storage_name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)

    att = Attachment(
        transaction=tx,
        filename=Path(upload.filename or "adjunto").name[:255],
        mime_type=mime,
        size=len(data),
        sha256=hashlib.sha256(data).hexdigest(),
        storage_name=storage_name,
    )
    db.add(att)
    return att


def delete_files(attachments: list[Attachment]) -> None:
    """Borra del disco los ficheros. Llamar después de hacer commit en la base de datos."""
    for att in attachments:
        attachment_path(att).unlink(missing_ok=True)
