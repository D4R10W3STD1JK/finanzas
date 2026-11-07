from datetime import date
from functools import lru_cache

import holidays


class BusinessCalendar:
    """Días hábiles: de lunes a viernes, sin festivos nacionales ni autonómicos."""

    def __init__(self, country: str = "ES", subdiv: str | None = "VC"):
        self._holidays = holidays.country_holidays(country, subdiv=subdiv)

    def is_holiday(self, d: date) -> bool:
        return d in self._holidays

    def is_business_day(self, d: date) -> bool:
        return d.weekday() < 5 and d not in self._holidays


@lru_cache
def get_calendar(country: str, subdiv: str | None) -> BusinessCalendar:
    return BusinessCalendar(country, subdiv)


# Nombres que la librería abrevia demasiado.
_NAMES = {("ES", "VC"): "Comunitat Valenciana"}


@lru_cache
def supported_regions() -> dict[str, list[tuple[str, str]]]:
    """Países con calendario de festivos y, de cada uno, sus regiones como (código, nombre)."""
    result: dict[str, list[tuple[str, str]]] = {}
    for country, subdivs in holidays.list_supported_countries(include_aliases=False).items():
        cls = getattr(holidays, country, None)
        aliases = getattr(cls, "subdivisions_aliases", {}) or {}
        names: dict[str, str] = {}
        for alias, code in aliases.items():
            # Entre los alias de una región (p. ej. «GUA» y «Guadeloupe»), el más largo es el nombre.
            if len(alias) > len(names.get(code, "")):
                names[code] = alias
        result[country] = sorted(((code, _NAMES.get((country, code)) or names.get(code, code)) for code in subdivs), key=lambda r: r[1].lower())
    return result


def is_valid_region(country: str, subdiv: str | None) -> bool:
    regions = supported_regions()
    if country not in regions:
        return False
    return subdiv is None or any(code == subdiv for code, _ in regions[country])
