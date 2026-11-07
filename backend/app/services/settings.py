from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings, today
from app.domain.calendar_es import BusinessCalendar, get_calendar, is_valid_region
from app.models.settings import AppSetting
from app.schemas.settings import AppSettings, HolidayRegion
from app.services.errors import Invalid

HOLIDAY_KEYS = ("holidays_country", "holidays_subdiv")


def defaults() -> AppSettings:
    env = get_settings()
    return AppSettings(
        # Se empieza con 0 €: un umbral de 0 avisa cuando el saldo previsto se quedaría en negativo.
        low_balance_threshold=Decimal("0.00"),
        forecast_include_variable=True,
        # Festivos: los de la instalación (.env) hasta que el usuario elija los suyos.
        holidays_country=env.holidays_country,
        holidays_subdiv=env.holidays_subdiv or None,
    )


def get_app_settings(db: Session) -> AppSettings:
    stored = {s.key: s.value for s in db.query(AppSetting).all()}
    return AppSettings.model_validate({**defaults().model_dump(mode="json"), **stored})


def check_region(region: HolidayRegion) -> None:
    if not is_valid_region(region.holidays_country, region.holidays_subdiv):
        raise Invalid("El país o la región de los festivos no es válido")


def user_calendar(db: Session) -> BusinessCalendar:
    """Calendario de días hábiles del usuario actual, según su país y región."""
    prefs = get_app_settings(db)
    return get_calendar(prefs.holidays_country, prefs.holidays_subdiv)


def update_app_settings(db: Session, data: AppSettings) -> AppSettings:
    check_region(data)
    before = get_app_settings(db)
    for key, value in data.model_dump(mode="json").items():
        row = db.scalar(select(AppSetting).where(AppSetting.key == key))
        if row is None:
            db.add(AppSetting(key=key, value=value))
        else:
            row.value = value
    db.commit()
    if any(getattr(before, k) != getattr(data, k) for k in HOLIDAY_KEYS):
        # Otros festivos: se recolocan los pagos previstos que se mueven a día hábil (los confirmados no cambian).
        from app.services.recurring import sync_all

        sync_all(db, today())
    return get_app_settings(db)
