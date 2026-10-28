from datetime import date
from typing import Annotated

from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app import config
from app.db import get_db
from app.models import User
from app.security import COOKIE_NAME, decode_session_token

DB = Annotated[Session, Depends(get_db)]


def current_user(db: DB, session: Annotated[str | None, Cookie(alias=COOKIE_NAME)] = None) -> User:
    user_id = decode_session_token(session) if session else None
    user = db.get(User, user_id) if user_id else None
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sesión no iniciada o caducada")
    return user


def get_today() -> date:
    return config.today()


CurrentUser = Annotated[User, Depends(current_user)]
Today = Annotated[date, Depends(get_today)]
