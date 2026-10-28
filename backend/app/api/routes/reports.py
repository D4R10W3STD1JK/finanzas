from datetime import date

from fastapi import APIRouter

from app.api.deps import DB, Today
from app.schemas.reports import DashboardOut, ForecastOut, ProvisionsOut, RecurringCostsOut
from app.schemas.settings import AppSettings
from app.services import planning, reports
from app.services.errors import Invalid
from app.services.settings import get_app_settings, update_app_settings

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(db: DB, today: Today, month: date | None = None):
    """Resumen de un mes (por defecto el actual). `month` puede ser cualquier día de ese mes."""
    return reports.dashboard(db, month or today, today)


@router.get("/recurring-costs", response_model=RecurringCostsOut)
def recurring_costs(db: DB, today: Today):
    """Coste mensual y anual equivalente de todos los recurrentes activos."""
    return reports.recurring_costs(db, today)


@router.get("/forecast", response_model=ForecastOut)
def forecast(
    db: DB,
    today: Today,
    months: int = 3,
    include_variable: bool | None = None,
):
    """Proyección del saldo a 3, 6 o 12 meses. Sin `include_variable` se usa la preferencia guardada."""
    if months not in (3, 6, 12):
        raise Invalid("El horizonte de la previsión debe ser de 3, 6 o 12 meses")
    prefs = get_app_settings(db)
    include = prefs.forecast_include_variable if include_variable is None else include_variable
    return planning.forecast(db, today, months, include, prefs.low_balance_threshold)


@router.get("/provisions", response_model=ProvisionsOut)
def provisions(db: DB, today: Today):
    """Hucha virtual para los gastos trimestrales, semestrales, anuales..."""
    return planning.provisions(db, today)


settings_router = APIRouter(prefix="/settings", tags=["settings"])


@settings_router.get("", response_model=AppSettings)
def read_settings(db: DB):
    return get_app_settings(db)


@settings_router.put("", response_model=AppSettings)
def write_settings(data: AppSettings, db: DB):
    return update_app_settings(db, data)
