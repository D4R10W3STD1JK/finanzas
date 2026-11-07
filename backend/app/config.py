from datetime import date, datetime
from functools import lru_cache
from zoneinfo import ZoneInfo

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://finanzas:finanzas@db:5432/finanzas"

    secret_key: str = "cambia-esta-clave"
    # Usuario inicial opcional: si ambos están definidos y aún no hay usuarios, se crea al arrancar.
    # Si se dejan vacíos, la primera cuenta se crea desde la pantalla de entrada.
    admin_username: str = ""
    admin_password: str = ""
    cookie_secure: bool = False
    session_days: int = 30
    # Si es False, solo se pueden crear usuarios desde Ajustes (con sesión) o desde la terminal.
    # Mientras no exista ningún usuario, la primera cuenta se puede crear siempre.
    allow_registration: bool = True

    timezone: str = "Europe/Madrid"
    # Festivos por defecto de los usuarios nuevos; cada uno puede elegir los suyos al crear la cuenta o en Ajustes.
    # Sin región, solo los festivos nacionales.
    holidays_country: str = "ES"
    holidays_subdiv: str | None = None

    # Hasta cuántos meses en el futuro se generan las ocurrencias de los recurrentes.
    occurrence_horizon_months: int = 18
    # Cada cuántos minutos se ejecutan las tareas periódicas (generar y confirmar ocurrencias).
    jobs_interval_minutes: int = 60
    jobs_enabled: bool = True

    attachments_dir: str = "/data/attachments"
    max_attachment_mb: int = 15


@lru_cache
def get_settings() -> Settings:
    return Settings()


def today() -> date:
    """Fecha de hoy en la zona horaria configurada (los tests la sustituyen)."""
    return datetime.now(ZoneInfo(get_settings().timezone)).date()
