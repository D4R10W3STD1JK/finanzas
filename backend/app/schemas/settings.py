from decimal import Decimal

from pydantic import field_validator

from app.schemas.common import Money, Schema


class AppSettings(Schema):
    # Avisar si el saldo total previsto baja de este importe.
    low_balance_threshold: Money
    # Incluir en la previsión el gasto no recurrente medio (supermercado, gasolina...).
    forecast_include_variable: bool

    @field_validator("low_balance_threshold")
    @classmethod
    def _cents(cls, v: Decimal) -> Decimal:
        return v.quantize(Decimal("0.01"))
