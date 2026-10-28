import logging

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import get_settings, today
from app.models import User
from app.security import hash_password
from app.seed.categories import seed_default_categories
from app.services.recurring import sync_all

log = logging.getLogger(__name__)


def ensure_admin_user(db: Session) -> None:
    """Crea el usuario de .env si aún no hay ninguno. Después la contraseña se cambia desde la app."""
    if db.scalar(select(func.count()).select_from(User)):
        return
    settings = get_settings()
    db.add(User(username=settings.admin_username, password_hash=hash_password(settings.admin_password)))
    db.commit()
    log.info("Usuario inicial '%s' creado", settings.admin_username)


def bootstrap(db: Session) -> None:
    ensure_admin_user(db)
    if seed_default_categories(db):
        log.info("Categorías iniciales creadas")
    run_jobs(db)


def run_jobs(db: Session) -> None:
    confirmed = sync_all(db, today())
    if confirmed:
        log.info("%d ocurrencias recurrentes confirmadas automáticamente", confirmed)
