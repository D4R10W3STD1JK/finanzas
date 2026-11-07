"""Series recurrentes en base de datos: generación, versiones, edición y confirmación."""

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.models import (
    AmountMode,
    BusinessDayAdjust,
    Frequency,
    OccurrenceStatus,
    Transaction,
    TransactionKind,
)
from app.schemas.recurring import ConfirmIn, NewVersionIn, OccurrencePatch, SeriesIn, SeriesPatch, VersionTerms
from app.services import recurring as svc
from app.services import transactions as tx_svc
from app.services.balances import account_balance
from app.services.errors import Conflict, Invalid
from tests.conftest import TODAY


@pytest.fixture
def bank(make_account):
    return make_account("Banco", initial="1000.00")


def terms(account_id, category_id=None, amount="100.00", **kw) -> VersionTerms:
    return VersionTerms(
        frequency=kw.pop("frequency", Frequency.MONTHLY),
        amount=Decimal(amount),
        account_id=account_id,
        category_id=category_id,
        concept=kw.pop("concept", "Recibo"),
        **kw,
    )


def new_series(db, account_id, category_id, start, today=TODAY, include_past=False, kind=TransactionKind.EXPENSE, **kw):
    data = SeriesIn(
        name=kw.pop("name", "Alquiler"),
        kind=kind,
        start_date=start,
        include_past=include_past,
        end_date=kw.pop("end_date", None),
        max_occurrences=kw.pop("max_occurrences", None),
        auto_confirm=kw.pop("auto_confirm", True),
        terms=terms(account_id, category_id, **kw),
    )
    return svc.create_series(db, data, today)


def by_status(series, status):
    return [o for o in series.occurrences if o.status == status]


def test_genera_ocurrencias_hasta_el_horizonte(db, bank, cat):
    s = new_series(db, bank.id, cat("Alquiler"), date(2026, 7, 1))
    assert len(s.occurrences) == 18  # julio 2026 → diciembre 2027 (horizonte hoy + 18 meses)
    assert s.occurrences[0].scheduled_date == date(2026, 7, 1)
    assert s.occurrences[-1].scheduled_date == date(2027, 12, 1)
    assert all(o.status == OccurrenceStatus.PLANNED for o in s.occurrences)


def test_serie_antigua_no_genera_pasado_salvo_que_se_pida(db, bank, cat):
    s = new_series(db, bank.id, cat("Alquiler"), date(2025, 1, 1))
    assert s.track_from == TODAY
    assert s.occurrences[0].scheduled_date == date(2026, 7, 1)
    assert db.scalar(select(func.count()).select_from(Transaction)) == 0


def test_include_past_autoconfirma_lo_vencido(db, bank, cat):
    s = new_series(db, bank.id, cat("Alquiler"), date(2026, 1, 1), include_past=True)
    confirmed = by_status(s, OccurrenceStatus.CONFIRMED)
    assert [o.scheduled_date.month for o in confirmed] == [1, 2, 3, 4, 5, 6]
    assert all(o.transaction.amount == Decimal("100.00") for o in confirmed)
    assert account_balance(db, bank.id) == Decimal("400.00")


def test_variable_no_se_autoconfirma_y_se_confirma_con_importe_real(db, bank, cat):
    s = new_series(db, bank.id, cat("Luz"), date(2026, 5, 12), include_past=True,
                   amount_mode=AmountMode.VARIABLE, amount="60.00")
    may = s.occurrences[0]
    assert may.status == OccurrenceStatus.PLANNED and may.due_date < TODAY
    occ = svc.confirm_occurrence(db, may.id, ConfirmIn(amount=Decimal("73.18")))
    assert occ.status == OccurrenceStatus.CONFIRMED
    assert occ.transaction.amount == Decimal("73.18")
    assert occ.expected_amount == Decimal("60.00")  # el estimado se conserva
    assert account_balance(db, bank.id) == Decimal("926.82")


def test_auto_confirm_desactivado(db, bank, cat):
    s = new_series(db, bank.id, cat("Alquiler"), date(2026, 1, 1), include_past=True, auto_confirm=False)
    assert not by_status(s, OccurrenceStatus.CONFIRMED)


def test_sync_all_pone_al_dia_tras_dias_apagado(db, bank, cat):
    s = new_series(db, bank.id, cat("Alquiler"), date(2026, 7, 1))
    assert not by_status(s, OccurrenceStatus.CONFIRMED)
    confirmed = svc.sync_all(db, date(2026, 9, 3))  # el equipo vuelve a encenderse en septiembre
    assert confirmed == 3
    s = svc.get_series(db, s.id)
    assert s.occurrences[-1].scheduled_date == date(2028, 3, 1)  # el horizonte avanza


def test_ajuste_a_dia_habil_conserva_fecha_teorica(db, bank, cat):
    s = new_series(db, bank.id, cat("Alquiler"), date(2026, 10, 9), business_day_adjust=BusinessDayAdjust.NEXT)
    first = s.occurrences[0]
    assert first.scheduled_date == date(2026, 10, 9)
    assert first.due_date == date(2026, 10, 13)


def test_festivos_de_cada_usuario(db, bank, cat):
    """El 9 de octubre es festivo en la Comunitat Valenciana pero no en Madrid."""
    from app.services.settings import get_app_settings, update_app_settings

    s = new_series(db, bank.id, cat("Alquiler"), date(2026, 10, 9), business_day_adjust=BusinessDayAdjust.NEXT)
    assert s.occurrences[0].due_date == date(2026, 10, 13)

    prefs = get_app_settings(db)
    assert (prefs.holidays_country, prefs.holidays_subdiv) == ("ES", "VC")  # los de .env hasta que elija
    update_app_settings(db, prefs.model_copy(update={"holidays_subdiv": "MD"}))
    assert svc.get_series(db, s.id).occurrences[0].due_date == date(2026, 10, 9)

    with pytest.raises(Invalid):
        update_app_settings(db, prefs.model_copy(update={"holidays_country": "XX"}))
    with pytest.raises(Invalid):
        update_app_settings(db, prefs.model_copy(update={"holidays_subdiv": "ZZ"}))


def test_cambio_a_partir_de_fecha_conserva_historico(db, bank, cat):
    """Subida del alquiler desde abril: lo confirmado y lo editado a mano no cambia."""
    s = new_series(db, bank.id, cat("Alquiler"), date(2026, 1, 1), include_past=True, amount="800.00")
    sept = next(o for o in s.occurrences if o.scheduled_date == date(2026, 9, 1))
    svc.edit_occurrence(db, sept.id, OccurrencePatch(expected_amount=Decimal("790.00")))

    s = svc.add_version(db, s.id, NewVersionIn(
        effective_from=date(2026, 4, 1), terms=terms(bank.id, cat("Alquiler"), amount="850.00")), TODAY)

    amounts = {o.scheduled_date: (o.status, o.expected_amount) for o in s.occurrences}
    assert amounts[date(2026, 3, 1)] == (OccurrenceStatus.CONFIRMED, Decimal("800.00"))
    # Abril-junio ya estaban confirmados: se conservan con su importe original
    assert amounts[date(2026, 5, 1)] == (OccurrenceStatus.CONFIRMED, Decimal("800.00"))
    assert amounts[date(2026, 7, 1)] == (OccurrenceStatus.PLANNED, Decimal("850.00"))
    assert amounts[date(2026, 9, 1)] == (OccurrenceStatus.PLANNED, Decimal("790.00"))  # editada a mano
    assert amounts[date(2026, 10, 1)] == (OccurrenceStatus.PLANNED, Decimal("850.00"))
    assert [v.effective_from for v in s.versions] == [date(2026, 1, 1), date(2026, 4, 1)]


def test_nueva_version_descarta_las_posteriores(db, bank, cat):
    s = new_series(db, bank.id, cat("Alquiler"), date(2026, 7, 1))
    svc.add_version(db, s.id, NewVersionIn(effective_from=date(2027, 1, 1), terms=terms(bank.id, cat("Alquiler"), amount="120")), TODAY)
    s = svc.add_version(db, s.id, NewVersionIn(effective_from=date(2026, 10, 1), terms=terms(bank.id, cat("Alquiler"), amount="110")), TODAY)
    assert [v.effective_from for v in s.versions] == [date(2026, 7, 1), date(2026, 10, 1)]
    assert {o.expected_amount for o in s.occurrences if o.scheduled_date >= date(2026, 10, 1)} == {Decimal("110.00")}


def test_cambio_de_dia_regenera_previstas(db, bank, cat):
    s = new_series(db, bank.id, cat("Alquiler"), date(2026, 7, 1))
    s = svc.add_version(db, s.id, NewVersionIn(
        effective_from=date(2026, 9, 1), terms=terms(bank.id, cat("Alquiler"), day_of_month=15)), TODAY)
    days = [o.scheduled_date for o in s.occurrences][:4]
    assert days == [date(2026, 7, 1), date(2026, 8, 1), date(2026, 9, 15), date(2026, 10, 15)]


def test_editar_toda_la_serie_desde_el_inicio(db, bank, cat):
    s = new_series(db, bank.id, cat("Alquiler"), date(2026, 7, 1))
    s = svc.add_version(db, s.id, NewVersionIn(
        effective_from=date(2026, 7, 1), terms=terms(bank.id, cat("Alquiler"), amount="99")), TODAY)
    assert len(s.versions) == 1
    assert {o.expected_amount for o in s.occurrences} == {Decimal("99.00")}


def test_fin_y_repeticiones(db, bank, cat):
    s = new_series(db, bank.id, cat("Alquiler"), date(2026, 7, 1), max_occurrences=3)
    assert len(s.occurrences) == 3
    s = svc.update_series(db, s.id, SeriesPatch(max_occurrences=None, end_date=date(2026, 12, 31)), TODAY)
    assert [o.scheduled_date.month for o in s.occurrences] == [7, 8, 9, 10, 11, 12]


def test_omitir_y_restaurar(db, bank, cat):
    s = new_series(db, bank.id, cat("Alquiler"), date(2026, 7, 1))
    occ = svc.skip_occurrence(db, s.occurrences[0].id)
    assert occ.status == OccurrenceStatus.SKIPPED
    with pytest.raises(Conflict):
        svc.confirm_occurrence(db, occ.id, ConfirmIn())
    # La regeneración no resucita lo omitido
    svc.sync_all(db, date(2026, 7, 5))
    assert svc.get_occurrence(db, occ.id).status == OccurrenceStatus.SKIPPED
    occ = svc.unskip_occurrence(db, occ.id)
    assert occ.status == OccurrenceStatus.PLANNED and occ.is_overridden


def test_editar_ocurrencia_y_restablecer(db, bank, cat):
    s = new_series(db, bank.id, cat("Alquiler"), date(2026, 7, 1))
    occ = svc.edit_occurrence(db, s.occurrences[0].id, OccurrencePatch(due_date=date(2026, 7, 3), expected_amount=Decimal("150")))
    assert occ.is_overridden and occ.due_date == date(2026, 7, 3)
    # Al llegar la fecha no se autoconfirma porque está gestionada a mano
    svc.sync_all(db, date(2026, 7, 10))
    assert svc.get_occurrence(db, occ.id).status == OccurrenceStatus.PLANNED
    occ = svc.reset_occurrence(db, occ.id, TODAY)
    assert not occ.is_overridden
    assert occ.due_date == date(2026, 7, 1) and occ.expected_amount == Decimal("100.00")


def test_deshacer_confirmacion_y_borrar_movimiento(db, bank, cat):
    s = new_series(db, bank.id, cat("Alquiler"), date(2026, 5, 1), include_past=True)
    may, june = s.occurrences[0], s.occurrences[1]
    occ = svc.unconfirm_occurrence(db, may.id)
    assert occ.status == OccurrenceStatus.PLANNED and occ.transaction is None and occ.is_overridden

    tx_svc.delete_transaction(db, june.transaction.id)
    june = svc.get_occurrence(db, june.id)
    assert june.status == OccurrenceStatus.PLANNED and june.is_overridden
    svc.sync_all(db, TODAY)  # no se vuelven a confirmar solas
    assert account_balance(db, bank.id) == Decimal("1000.00")


def test_borrar_serie_conserva_movimientos(db, bank, cat):
    s = new_series(db, bank.id, cat("Alquiler"), date(2026, 5, 1), include_past=True)
    svc.delete_series(db, s.id)
    txs = db.scalars(select(Transaction)).all()
    assert len(txs) == 2 and all(t.occurrence_id is None for t in txs)
    assert account_balance(db, bank.id) == Decimal("800.00")


def test_transferencia_recurrente(db, bank, make_account):
    savings = make_account("Ahorro")
    s = new_series(db, bank.id, None, date(2026, 6, 1), include_past=True,
                   kind=TransactionKind.TRANSFER, to_account_id=savings.id, amount="200")
    assert s.occurrences[0].transaction.kind == TransactionKind.TRANSFER
    assert account_balance(db, bank.id) == Decimal("800.00")
    assert account_balance(db, savings.id) == Decimal("200.00")


def test_validaciones(db, bank, cat, income_cat):
    with pytest.raises(Invalid):  # categoría de ingreso en un gasto
        new_series(db, bank.id, income_cat, date(2026, 7, 1))
    with pytest.raises(Invalid):  # transferencia sin destino
        new_series(db, bank.id, None, date(2026, 7, 1), kind=TransactionKind.TRANSFER)
    with pytest.raises(Invalid):  # cuenta inexistente
        new_series(db, 99999, cat("Alquiler"), date(2026, 7, 1))
