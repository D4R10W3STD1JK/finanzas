import time

from fastapi import APIRouter, HTTPException, Response, status
from sqlalchemy import func, select

from app.api.deps import DB, CurrentUser
from app.config import get_settings
from app.models import User
from app.schemas.core import ChangePasswordIn, LoginIn, UserOut
from app.security import COOKIE_NAME, create_session_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

# Freno sencillo a la fuerza bruta: tras 5 fallos seguidos, bloqueo de 60 s por usuario.
_MAX_FAILURES = 5
_LOCK_SECONDS = 60
_failures: dict[str, tuple[int, float]] = {}


@router.post("/login", response_model=UserOut)
def login(data: LoginIn, response: Response, db: DB):
    key = data.username.strip().lower()
    count, last = _failures.get(key, (0, 0.0))
    if count >= _MAX_FAILURES and time.monotonic() - last < _LOCK_SECONDS:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Demasiados intentos. Espera un minuto.")

    user = db.scalar(select(User).where(func.lower(User.username) == key))
    if user is None or not verify_password(user.password_hash, data.password):
        _failures[key] = (count + 1 if count < _MAX_FAILURES else 1, time.monotonic())
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario o contraseña incorrectos")

    _failures.pop(key, None)
    settings = get_settings()
    response.set_cookie(
        COOKIE_NAME,
        create_session_token(user.id),
        max_age=settings.session_days * 86400,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="strict",
        path="/",
    )
    return user


@router.post("/logout", status_code=204)
def logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser):
    return user


@router.post("/change-password", status_code=204)
def change_password(data: ChangePasswordIn, user: CurrentUser, db: DB):
    if not verify_password(user.password_hash, data.current_password):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La contraseña actual no es correcta")
    user.password_hash = hash_password(data.new_password)
    db.commit()
