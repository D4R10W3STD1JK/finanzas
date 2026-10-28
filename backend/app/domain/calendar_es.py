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
