from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query

from app.api.deps import DB, Today
from app.models import Occurrence, OccurrenceStatus, RecurringSeries
from app.schemas.recurring import (
    ConfirmIn,
    NewVersionIn,
    OccurrenceOut,
    OccurrencePatch,
    SeriesDetail,
    SeriesIn,
    SeriesOut,
    SeriesPatch,
    VersionOut,
)
from app.services import recurring as svc

router = APIRouter(tags=["recurring"])


def occurrence_out(occ: Occurrence) -> OccurrenceOut:
    series = occ.series
    version = occ.version or series.version_at(occ.scheduled_date)
    tx = occ.transaction
    return OccurrenceOut(
        id=occ.id,
        series_id=series.id,
        series_name=series.name,
        kind=series.kind,
        is_subscription=series.is_subscription,
        amount_mode=version.amount_mode,
        scheduled_date=occ.scheduled_date,
        due_date=occ.due_date,
        expected_amount=occ.expected_amount,
        status=occ.status,
        is_overridden=occ.is_overridden,
        notes=occ.notes,
        account_id=tx.account_id if tx else version.account_id,
        to_account_id=tx.to_account_id if tx else version.to_account_id,
        category_id=tx.category_id if tx else version.category_id,
        concept=tx.concept if tx else version.concept,
        transaction_id=tx.id if tx else None,
        actual_amount=tx.amount if tx else None,
    )


def _summary(series: RecurringSeries, today: date) -> dict:
    planned = [o for o in series.occurrences if o.status == OccurrenceStatus.PLANNED]
    upcoming = [o for o in planned if o.due_date >= today]
    return {
        "id": series.id,
        "name": series.name,
        "kind": series.kind,
        "is_subscription": series.is_subscription,
        "auto_confirm": series.auto_confirm,
        "start_date": series.start_date,
        "end_date": series.end_date,
        "max_occurrences": series.max_occurrences,
        "track_from": series.track_from,
        "notes": series.notes,
        "current": VersionOut.model_validate(series.version_at(today)),
        "next_occurrence": occurrence_out(min(upcoming, key=lambda o: o.due_date)) if upcoming else None,
        "pending_count": len(planned) - len(upcoming),
        "finished": not planned and (series.end_date is not None or series.max_occurrences is not None),
    }


def series_out(series: RecurringSeries, today: date) -> SeriesOut:
    return SeriesOut(**_summary(series, today))


def series_detail(series: RecurringSeries, today: date) -> SeriesDetail:
    return SeriesDetail(
        **_summary(series, today),
        versions=[VersionOut.model_validate(v) for v in series.versions],
        occurrences=[occurrence_out(o) for o in series.occurrences],
    )


@router.get("/recurring", response_model=list[SeriesOut])
def list_series(db: DB, today: Today):
    return [series_out(s, today) for s in svc.list_series(db)]


@router.get("/recurring/{series_id}", response_model=SeriesDetail)
def get_series(series_id: int, db: DB, today: Today):
    return series_detail(svc.get_series(db, series_id), today)


@router.post("/recurring", response_model=SeriesDetail, status_code=201)
def create_series(data: SeriesIn, db: DB, today: Today):
    return series_detail(svc.create_series(db, data, today), today)


@router.patch("/recurring/{series_id}", response_model=SeriesDetail)
def update_series(series_id: int, data: SeriesPatch, db: DB, today: Today):
    return series_detail(svc.update_series(db, series_id, data, today), today)


@router.post("/recurring/{series_id}/versions", response_model=SeriesDetail)
def add_version(series_id: int, data: NewVersionIn, db: DB, today: Today):
    """Modifica la serie a partir de una fecha (p. ej. subida del alquiler) conservando el histórico."""
    return series_detail(svc.add_version(db, series_id, data, today), today)


@router.delete("/recurring/{series_id}", status_code=204)
def delete_series(series_id: int, db: DB):
    svc.delete_series(db, series_id)


@router.get("/occurrences", response_model=list[OccurrenceOut])
def list_occurrences(
    db: DB,
    date_from: date | None = None,
    date_to: date | None = None,
    status: Annotated[list[OccurrenceStatus] | None, Query()] = None,
    series_id: int | None = None,
):
    return [occurrence_out(o) for o in svc.list_occurrences(db, date_from, date_to, status, series_id)]


@router.patch("/occurrences/{occ_id}", response_model=OccurrenceOut)
def edit_occurrence(occ_id: int, data: OccurrencePatch, db: DB):
    return occurrence_out(svc.edit_occurrence(db, occ_id, data))


@router.post("/occurrences/{occ_id}/confirm", response_model=OccurrenceOut)
def confirm_occurrence(occ_id: int, data: ConfirmIn, db: DB):
    return occurrence_out(svc.confirm_occurrence(db, occ_id, data))


@router.post("/occurrences/{occ_id}/unconfirm", response_model=OccurrenceOut)
def unconfirm_occurrence(occ_id: int, db: DB):
    return occurrence_out(svc.unconfirm_occurrence(db, occ_id))


@router.post("/occurrences/{occ_id}/skip", response_model=OccurrenceOut)
def skip_occurrence(occ_id: int, db: DB):
    return occurrence_out(svc.skip_occurrence(db, occ_id))


@router.post("/occurrences/{occ_id}/unskip", response_model=OccurrenceOut)
def unskip_occurrence(occ_id: int, db: DB):
    return occurrence_out(svc.unskip_occurrence(db, occ_id))


@router.post("/occurrences/{occ_id}/reset", response_model=OccurrenceOut)
def reset_occurrence(occ_id: int, db: DB, today: Today):
    return occurrence_out(svc.reset_occurrence(db, occ_id, today))
