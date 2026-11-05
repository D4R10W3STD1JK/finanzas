import time

from fastapi import APIRouter, HTTPException, Request, Response, status
from sqlalchemy import func, select

from app.api.deps import DB, CurrentUser
from app.config import get_settings
from app.models import User
from app.schemas.core import AuthOptionsOut, ChangePasswordIn, LoginIn, UserCreateIn, UserOut
from app.services import users
from app.security import COOKIE_NAME, create_session_token, hash_password, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])

# Freno sencillo a la fuerza bruta: tras 5 fallos seguidos, bloqueo de 60 s por usuario.
_MAX_FAILURES = 5
_LOCK_SECONDS = 60
_failures: dict[str, tuple[int, float]] = {}
_MAX_REGISTRATIONS_PER_HOUR = 5
_registrations: dict[str, list[float]] = {}


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
    _start_session(response, user)
    return user


@router.get("/options", response_model=AuthOptionsOut)
def options():
    """Lo que la pantalla de entrada necesita saber antes de iniciar sesión."""
    return {"registration_open": get_settings().allow_registration}


@router.post("/register", response_model=UserOut, status_code=201)
def register(data: UserCreateIn, request: Request, response: Response, db: DB):
    """Crea un usuario nuevo, con sus propias finanzas, e inicia su sesión."""
    if not get_settings().allow_registration:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "El registro de usuarios nuevos está desactivado")
    # Freno a la creación masiva de cuentas: unas pocas por hora desde cada dirección.
    ip = request.client.host if request.client else "?"
    now = time.monotonic()
    recent = [t for t in _registrations.get(ip, []) if now - t < 3600]
    if len(recent) >= _MAX_REGISTRATIONS_PER_HOUR:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Se han creado demasiadas cuentas seguidas. Prueba más tarde.")
    user = users.create_user(db, data.username, data.password)
    _registrations[ip] = [*recent, now]
    _start_session(response, user)
    return user


def _start_session(response: Response, user: User) -> None:
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
