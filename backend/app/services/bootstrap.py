import logging

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings, today
from app.models import User
from app.seed.categories import seed_default_categories
from app.services.recurring import sync_all
from app.services.users import create_user, list_users
from app.tenancy import as_user

log = logging.getLogger(__name__)


def ensure_admin_user(db: Session) -> None:
    """Crea el usuario de .env si aún no hay ninguno. Después la contraseña se cambia desde la app."""
    if db.scalar(select(func.count()).select_from(User)):
        return
    settings = get_settings()
    create_user(db, settings.admin_username, settings.admin_password)
    log.info("Usuario inicial '%s' creado", settings.admin_username)


def bootstrap(db: Session) -> None:
    ensure_admin_user(db)
    for user in list_users(db):
        with as_user(db, user.id):
            if seed_default_categories(db):
                log.info("Categorías iniciales creadas para %s", user.username)
    run_jobs(db)


def run_jobs(db: Session) -> None:
    """Tareas periódicas de todos los usuarios, cada una con sus propios datos."""
    for user in list_users(db):
        with as_user(db, user.id):
            confirmed = sync_all(db, today())
        if confirmed:
            log.info("%s: %d ocurrencias recurrentes confirmadas automáticamente", user.username, confirmed)
