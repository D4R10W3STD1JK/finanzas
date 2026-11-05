"""Varios usuarios, cada uno con sus propias finanzas.

Cada tabla de datos lleva `user_id` (mixin `Owned`). En vez de filtrar a mano en cada consulta,
la sesión sabe quién es el usuario actual y:

- añade `user_id = <actual>` a toda consulta, actualización o borrado ORM de esas tablas
  (también en joins y subconsultas), y
- pone ese `user_id` a toda fila nueva al guardarla.

Si se consultan datos sin haber fijado el usuario, se lanza un error en lugar de devolver los
de todos: un olvido no puede mezclar las finanzas de dos personas.
"""

from collections.abc import Iterator
from contextlib import contextmanager

from sqlalchemy import event
from sqlalchemy.orm import ORMExecuteState, Session, with_loader_criteria

from app.models.core import Owned

_USER_KEY = "user_id"


class NoCurrentUser(RuntimeError):
    def __init__(self) -> None:
        super().__init__("Consulta de datos sin usuario actual: falta set_current_user()")


def set_current_user(db: Session, user_id: int) -> None:
    previous = db.info.get(_USER_KEY)
    if previous is not None and previous != user_id:
        # Los objetos ya cargados son del usuario anterior: que no se reutilicen por error.
        db.expunge_all()
    db.info[_USER_KEY] = user_id


def current_user_id(db: Session) -> int:
    user_id = db.info.get(_USER_KEY)
    if user_id is None:
        raise NoCurrentUser()
    return user_id


@contextmanager
def as_user(db: Session, user_id: int) -> Iterator[None]:
    """Trabaja temporalmente como otro usuario (crear sus datos iniciales, tareas periódicas...)."""
    previous = db.info.get(_USER_KEY)
    set_current_user(db, user_id)
    try:
        yield
    finally:
        if previous is None:
            db.expunge_all()
            db.info.pop(_USER_KEY, None)
        else:
            set_current_user(db, previous)


@event.listens_for(Session, "do_orm_execute")
def _only_current_user_rows(state: ORMExecuteState) -> None:
    if not (state.is_select or state.is_update or state.is_delete):
        return
    if state.is_column_load or state.is_relationship_load:
        return  # el objeto padre ya se cargó filtrado
    user_id = state.session.info.get(_USER_KEY)
    if user_id is None:
        if any(issubclass(m.class_, Owned) for m in state.all_mappers):
            raise NoCurrentUser()
        return
    state.statement = state.statement.options(
        with_loader_criteria(Owned, lambda cls: cls.user_id == user_id, include_aliases=True)
    )


@event.listens_for(Session, "before_flush")
def _assign_owner(session: Session, _ctx, _instances) -> None:
    for obj in session.new:
        if isinstance(obj, Owned) and obj.user_id is None:
            obj.user_id = current_user_id(session)
