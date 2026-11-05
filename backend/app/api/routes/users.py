from fastapi import APIRouter

from app.api.deps import DB
from app.schemas.core import UserCreateIn, UserOut
from app.services import users

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(db: DB):
    return users.list_users(db)


@router.post("", response_model=UserOut, status_code=201)
def create_user(data: UserCreateIn, db: DB):
    """Crea un usuario con sus propias finanzas (vacías, salvo las categorías iniciales)."""
    return users.create_user(db, data.username, data.password)
