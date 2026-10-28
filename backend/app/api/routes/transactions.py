from datetime import date
from decimal import Decimal
from typing import Annotated
from urllib.parse import quote

from fastapi import APIRouter, Query, UploadFile
from fastapi.responses import FileResponse

from app.api.deps import DB
from app.models import Attachment, Transaction, TransactionKind
from app.schemas.core import AttachmentOut, TransactionIn, TransactionOut, TransactionPage
from app.services import attachments
from app.services import transactions as svc
from app.services.errors import NotFound, get_or_404

router = APIRouter(tags=["transactions"])


def to_out(tx: Transaction) -> TransactionOut:
    out = TransactionOut.model_validate(tx)
    out.series_id = svc.series_id_of(tx)
    return out


@router.get("/transactions", response_model=TransactionPage)
def list_transactions(
    db: DB,
    date_from: date | None = None,
    date_to: date | None = None,
    account_id: int | None = None,
    category_id: int | None = None,
    uncategorized: bool = False,
    kind: TransactionKind | None = None,
    tag_id: int | None = None,
    q: str | None = None,
    min_amount: Decimal | None = None,
    max_amount: Decimal | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    filters = svc.TransactionFilters(
        date_from=date_from,
        date_to=date_to,
        account_id=account_id,
        category_id=category_id,
        uncategorized=uncategorized,
        kind=kind,
        tag_id=tag_id,
        q=q,
        min_amount=min_amount,
        max_amount=max_amount,
    )
    items, total, income, expense = svc.list_transactions(db, filters, limit, offset)
    return TransactionPage(items=[to_out(t) for t in items], total=total, sum_income=income, sum_expense=expense)


@router.get("/transactions/{tx_id}", response_model=TransactionOut)
def get_transaction(tx_id: int, db: DB):
    return to_out(svc.get_transaction(db, tx_id))


@router.post("/transactions", response_model=TransactionOut, status_code=201)
def create_transaction(data: TransactionIn, db: DB):
    return to_out(svc.create_transaction(db, data))


@router.put("/transactions/{tx_id}", response_model=TransactionOut)
def update_transaction(tx_id: int, data: TransactionIn, db: DB):
    return to_out(svc.update_transaction(db, tx_id, data))


@router.delete("/transactions/{tx_id}", status_code=204)
def delete_transaction(tx_id: int, db: DB):
    svc.delete_transaction(db, tx_id)


@router.post("/transactions/{tx_id}/attachments", response_model=AttachmentOut, status_code=201)
def upload_attachment(tx_id: int, file: UploadFile, db: DB):
    tx = svc.get_transaction(db, tx_id)
    att = attachments.save_attachment(db, tx, file)
    db.commit()
    return att


@router.get("/attachments/{att_id}")
def download_attachment(att_id: int, db: DB, download: bool = False):
    att = get_or_404(db, Attachment, att_id, "Adjunto no encontrado")
    path = attachments.attachment_path(att)
    if not path.is_file():
        raise NotFound("El fichero del adjunto no está en el disco")
    disposition = "attachment" if download else "inline"
    return FileResponse(
        path,
        media_type=att.mime_type,
        headers={"Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(att.filename)}"},
    )


@router.delete("/attachments/{att_id}", status_code=204)
def delete_attachment(att_id: int, db: DB):
    att = get_or_404(db, Attachment, att_id, "Adjunto no encontrado")
    db.delete(att)
    db.commit()
    attachments.delete_files([att])
