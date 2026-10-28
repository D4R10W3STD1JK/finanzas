class AppError(Exception):
    status_code = 400

    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class NotFound(AppError):
    status_code = 404


class Conflict(AppError):
    status_code = 409


class Invalid(AppError):
    status_code = 422


def get_or_404[T](db, model: type[T], obj_id: int, message: str) -> T:
    obj = db.get(model, obj_id)
    if obj is None:
        raise NotFound(message)
    return obj
