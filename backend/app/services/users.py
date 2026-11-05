"""Usuarios. Cada uno tiene sus propias finanzas; cualquiera con sesión puede crear otros."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import User
from app.security import hash_password
from app.seed.categories import seed_default_categories
from app.services.errors import Conflict
from app.tenancy import as_user


def list_users(db: Session) -> list[User]:
    return list(db.scalars(select(User).order_by(func.lower(User.username))))


def find_user(db: Session, username: str) -> User | None:
    return db.scalar(select(User).where(func.lower(User.username) == username.strip().lower()))


def create_user(db: Session, username: str, password: str) -> User:
    """Crea el usuario con las categorías iniciales; sus cuentas y movimientos empiezan vacíos."""
    username = username.strip()
    if find_user(db, username):
        raise Conflict(f"Ya existe un usuario llamado {username}")
    user = User(username=username, password_hash=hash_password(password))
    db.add(user)
    db.commit()
    with as_user(db, user.id):
        seed_default_categories(db)
    return user
