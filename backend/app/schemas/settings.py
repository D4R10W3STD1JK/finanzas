from pydantic import field_validator

from app.schemas.common import Money, Schema


class HolidayRegion(Schema):
    # País (código ISO, p. ej. ES) y región opcional (p. ej. VC); sin región, solo los festivos nacionales.
    holidays_country: str
    holidays_subdiv: str | None = None

    @field_validator("holidays_country")
    @classmethod
    def _upper(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("holidays_subdiv")
    @classmethod
    def _blank_is_none(cls, v: str | None) -> str | None:
        return v.strip() or None if v is not None else None


class AppSettings(HolidayRegion):
    # Avisar si el saldo total previsto baja de este importe.
    low_balance_threshold: Money
    # Incluir en la previsión el gasto no recurrente medio (supermercado, gasolina...).
    forecast_include_variable: bool


class SubdivisionOut(Schema):
    code: str
    name: str


class HolidayCountryOut(Schema):
    code: str
    subdivisions: list[SubdivisionOut]


class HolidayRegionsOut(Schema):
    countries: list[HolidayCountryOut]
    # La región por defecto de la instalación (.env), para proponerla al crear una cuenta.
    default_country: str
    default_subdiv: str | None
