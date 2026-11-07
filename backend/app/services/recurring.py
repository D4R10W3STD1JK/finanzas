"""Series recurrentes y sus ocurrencias.

Reglas:
- Las ocurrencias se materializan hasta un horizonte móvil (hoy + N meses).
- Al regenerar una serie solo se tocan las ocurrencias *previstas* y *no editadas a mano*;
  las confirmadas, omitidas y editadas se conservan (histórico).
- Cambiar la serie "a partir de una fecha" crea una versión nueva desde esa fecha y descarta
  las versiones posteriores.
- Las ocurrencias de importe fijo se confirman solas al llegar su fecha (si la serie lo permite).
  Las variables quedan pendientes hasta que se confirme el importe real.
"""

from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.config import get_settings
from app.domain.recurrence import build_schedule, clamp_day, step_of
from app.models import (
    AmountMode,
    Occurrence,
    OccurrenceStatus,
    RecurringSeries,
    RecurringVersion,
    Transaction,
    TransactionKind,
)
from app.schemas.recurring import ConfirmIn, NewVersionIn, OccurrencePatch, SeriesIn, SeriesPatch, VersionTerms
from app.services import attachments
from app.services.errors import Conflict, Invalid, NotFound
from app.services.refs import check_category, check_transfer_accounts, load_tags
from app.services.settings import user_calendar

_SERIES_LOAD = (
    selectinload(RecurringSeries.versions).selectinload(RecurringVersion.tags),
    selectinload(RecurringSeries.occurrences).selectinload(Occurrence.transaction),
)


def horizon(today: date) -> date:
    months = get_settings().occurrence_horizon_months
    total = today.year * 12 + today.month - 1 + months
    return clamp_day(total // 12, total % 12 + 1, today.day)


def get_series(db: Session, series_id: int) -> RecurringSeries:
    series = db.scalar(select(RecurringSeries).where(RecurringSeries.id == series_id).options(*_SERIES_LOAD))
    if series is None:
        raise NotFound("Recurrente no encontrado")
    return series


def list_series(db: Session) -> list[RecurringSeries]:
    return list(db.scalars(select(RecurringSeries).options(*_SERIES_LOAD).order_by(RecurringSeries.name)))


def _apply_terms(db: Session, version: RecurringVersion, kind: TransactionKind, terms: VersionTerms) -> None:
    try:
        step_of(terms.frequency, terms.interval, terms.unit)
    except ValueError as e:
        raise Invalid(str(e)) from e
    to_account_id = terms.to_account_id if kind == TransactionKind.TRANSFER else None
    check_transfer_accounts(db, kind, terms.account_id, to_account_id)
    category_id = terms.category_id if kind != TransactionKind.TRANSFER else None
    check_category(db, category_id, kind)
    version.frequency = terms.frequency
    version.interval = terms.interval
    version.unit = terms.unit
    version.day_of_month = terms.day_of_month
    version.business_day_adjust = terms.business_day_adjust
    version.amount_mode = terms.amount_mode
    version.amount = terms.amount
    version.account_id = terms.account_id
    version.to_account_id = to_account_id
    version.category_id = category_id
    version.concept = terms.concept.strip()
    version.tags = load_tags(db, terms.tag_ids)


# --- Sincronización ---


def sync_series(db: Session, series: RecurringSeries, today: date) -> None:
    """Crea, actualiza o elimina ocurrencias previstas para que cuadren con las versiones."""
    db.flush()
    cal = user_calendar(db)
    versions = list(series.versions)
    schedule = build_schedule(
        [(i, v.rule()) for i, v in enumerate(versions)],
        until=horizon(today),
        end_date=series.end_date,
        max_count=series.max_occurrences,
        is_business_day=cal.is_business_day,
    )
    existing = {o.scheduled_date: o for o in series.occurrences}
    wanted: set[date] = set()
    for item in schedule:
        if item.scheduled < series.track_from:
            continue
        version = versions[item.key]
        wanted.add(item.scheduled)
        occ = existing.get(item.scheduled)
        if occ is None:
            series.occurrences.append(
                Occurrence(
                    version=version,
                    scheduled_date=item.scheduled,
                    due_date=item.due,
                    expected_amount=version.amount,
                    status=OccurrenceStatus.PLANNED,
                )
            )
        elif occ.status == OccurrenceStatus.PLANNED and not occ.is_overridden:
            occ.version = version
            occ.due_date = item.due
            occ.expected_amount = version.amount
    for scheduled, occ in existing.items():
        if scheduled not in wanted and occ.status == OccurrenceStatus.PLANNED:
            series.occurrences.remove(occ)
    db.flush()


def auto_confirm_series(db: Session, series: RecurringSeries, today: date) -> int:
    if not series.auto_confirm:
        return 0
    confirmed = 0
    for occ in series.occurrences:
        if (
            occ.status == OccurrenceStatus.PLANNED
            and not occ.is_overridden
            and occ.due_date <= today
            and occ.version is not None
            and occ.version.amount_mode == AmountMode.FIXED
        ):
            _confirm(db, occ, ConfirmIn())
            confirmed += 1
    return confirmed


def refresh_series(db: Session, series: RecurringSeries, today: date) -> None:
    sync_series(db, series, today)
    auto_confirm_series(db, series, today)


def sync_all(db: Session, today: date) -> int:
    """Tarea periódica (y al arrancar): amplía el horizonte y confirma lo vencido."""
    confirmed = 0
    for series in list_series(db):
        sync_series(db, series, today)
        confirmed += auto_confirm_series(db, series, today)
    db.commit()
    return confirmed


# --- Series ---


def create_series(db: Session, data: SeriesIn, today: date) -> RecurringSeries:
    series = RecurringSeries(
        name=data.name.strip(),
        kind=data.kind,
        is_subscription=data.is_subscription,
        auto_confirm=data.auto_confirm,
        start_date=data.start_date,
        end_date=data.end_date,
        max_occurrences=data.max_occurrences,
        track_from=data.start_date if data.include_past else max(data.start_date, today),
        notes=data.notes,
    )
    version = RecurringVersion(effective_from=data.start_date)
    _apply_terms(db, version, data.kind, data.terms)
    series.versions.append(version)
    db.add(series)
    refresh_series(db, series, today)
    db.commit()
    return get_series(db, series.id)


def update_series(db: Session, series_id: int, data: SeriesPatch, today: date) -> RecurringSeries:
    series = get_series(db, series_id)
    for field in data.model_fields_set:
        setattr(series, field, getattr(data, field))
    if series.end_date and series.end_date < series.start_date:
        raise Invalid("La fecha de fin no puede ser anterior a la de inicio")
    refresh_series(db, series, today)
    db.commit()
    return get_series(db, series.id)


def add_version(db: Session, series_id: int, data: NewVersionIn, today: date) -> RecurringSeries:
    """Modifica la serie a partir de ``effective_from`` conservando lo anterior."""
    series = get_series(db, series_id)
    if series.end_date and data.effective_from > series.end_date:
        raise Invalid("La fecha es posterior al fin de la serie")
    if data.effective_from <= series.start_date:
        # Cambio desde el principio: sustituye todas las versiones.
        # Si la serie registraba todo desde su inicio, sigue haciéndolo desde el nuevo inicio.
        if series.track_from <= series.start_date:
            series.track_from = data.effective_from
        series.start_date = data.effective_from
        replaced = list(series.versions)
    else:
        replaced = [v for v in series.versions if v.effective_from >= data.effective_from]
    for occ in series.occurrences:
        if occ.version in replaced:
            occ.version = None
    for v in replaced:
        series.versions.remove(v)
    db.flush()

    version = RecurringVersion(effective_from=data.effective_from)
    _apply_terms(db, version, series.kind, data.terms)
    series.versions.append(version)
    series.versions.sort(key=lambda v: v.effective_from)
    refresh_series(db, series, today)
    db.commit()
    return get_series(db, series.id)


def delete_series(db: Session, series_id: int) -> None:
    """Borra la serie y sus ocurrencias; los movimientos ya confirmados se conservan."""
    series = get_series(db, series_id)
    db.delete(series)
    db.commit()
    db.expire_all()  # los movimientos cargados aún apuntan a las ocurrencias borradas


# --- Ocurrencias ---


def get_occurrence(db: Session, occ_id: int) -> Occurrence:
    occ = db.scalar(
        select(Occurrence)
        .where(Occurrence.id == occ_id)
        .options(
            selectinload(Occurrence.series).selectinload(RecurringSeries.versions),
            selectinload(Occurrence.version).selectinload(RecurringVersion.tags),
            selectinload(Occurrence.transaction),
        )
    )
    if occ is None:
        raise NotFound("Ocurrencia no encontrada")
    return occ


def list_occurrences(
    db: Session,
    date_from: date | None = None,
    date_to: date | None = None,
    statuses: list[OccurrenceStatus] | None = None,
    series_id: int | None = None,
) -> list[Occurrence]:
    stmt = select(Occurrence).options(
        selectinload(Occurrence.series).selectinload(RecurringSeries.versions),
        selectinload(Occurrence.version),
        selectinload(Occurrence.transaction),
    )
    if date_from:
        stmt = stmt.where(Occurrence.due_date >= date_from)
    if date_to:
        stmt = stmt.where(Occurrence.due_date <= date_to)
    if statuses:
        stmt = stmt.where(Occurrence.status.in_(statuses))
    if series_id:
        stmt = stmt.where(Occurrence.series_id == series_id)
    return list(db.scalars(stmt.order_by(Occurrence.due_date, Occurrence.id)))


def _require_status(occ: Occurrence, status: OccurrenceStatus, action: str) -> None:
    if occ.status != status:
        labels = {
            OccurrenceStatus.PLANNED: "prevista",
            OccurrenceStatus.CONFIRMED: "confirmada",
            OccurrenceStatus.SKIPPED: "omitida",
        }
        raise Conflict(f"No se puede {action}: la ocurrencia está {labels[occ.status]}")


def _confirm(db: Session, occ: Occurrence, data: ConfirmIn) -> Transaction:
    _require_status(occ, OccurrenceStatus.PLANNED, "confirmar")
    series = occ.series
    version = occ.version or series.version_at(occ.scheduled_date)
    if version is None:
        raise Invalid("La serie no tiene condiciones definidas")
    account_id = data.account_id or version.account_id
    to_account_id = version.to_account_id if series.kind == TransactionKind.TRANSFER else None
    check_transfer_accounts(db, series.kind, account_id, to_account_id)
    category_id = data.category_id if "category_id" in data.model_fields_set else version.category_id
    check_category(db, category_id, series.kind)
    tx = Transaction(
        kind=series.kind,
        amount=data.amount or occ.expected_amount,
        date=data.date or occ.due_date,
        concept=version.concept,
        category_id=category_id,
        account_id=account_id,
        to_account_id=to_account_id,
        notes=data.notes if data.notes is not None else occ.notes,
        tags=list(version.tags),
    )
    occ.transaction = tx
    occ.status = OccurrenceStatus.CONFIRMED
    db.add(tx)
    db.flush()
    return tx


def confirm_occurrence(db: Session, occ_id: int, data: ConfirmIn) -> Occurrence:
    occ = get_occurrence(db, occ_id)
    _confirm(db, occ, data)
    db.commit()
    return get_occurrence(db, occ_id)


def unconfirm_occurrence(db: Session, occ_id: int) -> Occurrence:
    """Deshace la confirmación: borra el movimiento y deja la ocurrencia prevista y manual."""
    occ = get_occurrence(db, occ_id)
    _require_status(occ, OccurrenceStatus.CONFIRMED, "deshacer la confirmación")
    files = []
    if occ.transaction is not None:
        files = list(occ.transaction.attachments)
        db.delete(occ.transaction)
        occ.transaction = None
    occ.status = OccurrenceStatus.PLANNED
    occ.is_overridden = True
    db.commit()
    attachments.delete_files(files)
    return get_occurrence(db, occ_id)


def skip_occurrence(db: Session, occ_id: int) -> Occurrence:
    occ = get_occurrence(db, occ_id)
    _require_status(occ, OccurrenceStatus.PLANNED, "omitir")
    occ.status = OccurrenceStatus.SKIPPED
    db.commit()
    return get_occurrence(db, occ_id)


def unskip_occurrence(db: Session, occ_id: int) -> Occurrence:
    occ = get_occurrence(db, occ_id)
    _require_status(occ, OccurrenceStatus.SKIPPED, "restaurar")
    occ.status = OccurrenceStatus.PLANNED
    occ.is_overridden = True
    db.commit()
    return get_occurrence(db, occ_id)


def edit_occurrence(db: Session, occ_id: int, data: OccurrencePatch) -> Occurrence:
    """Edita solo esta ocurrencia, sin tocar la serie."""
    occ = get_occurrence(db, occ_id)
    _require_status(occ, OccurrenceStatus.PLANNED, "editar")
    for field in data.model_fields_set:
        value = getattr(data, field)
        if value is None and field != "notes":
            continue
        setattr(occ, field, value)
    occ.is_overridden = True
    db.commit()
    return get_occurrence(db, occ_id)


def reset_occurrence(db: Session, occ_id: int, today: date) -> Occurrence:
    """Descarta los cambios manuales y vuelve a los valores de la serie."""
    occ = get_occurrence(db, occ_id)
    _require_status(occ, OccurrenceStatus.PLANNED, "restablecer")
    occ.is_overridden = False
    occ.notes = None
    series = get_series(db, occ.series_id)
    refresh_series(db, series, today)
    db.commit()
    return get_occurrence(db, occ_id)
