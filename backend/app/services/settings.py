from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.settings import AppSetting
from app.schemas.settings import AppSettings

# Se empieza con 0 €: un umbral de 0 avisa cuando el saldo previsto se quedaría en negativo.
DEFAULTS = AppSettings(low_balance_threshold=Decimal("0.00"), forecast_include_variable=True)


def get_app_settings(db: Session) -> AppSettings:
    stored = {s.key: s.value for s in db.query(AppSetting).all()}
    return AppSettings.model_validate({**DEFAULTS.model_dump(mode="json"), **stored})


def update_app_settings(db: Session, data: AppSettings) -> AppSettings:
    for key, value in data.model_dump(mode="json").items():
        row = db.get(AppSetting, key)
        if row is None:
            db.add(AppSetting(key=key, value=value))
        else:
            row.value = value
    db.commit()
    return get_app_settings(db)
