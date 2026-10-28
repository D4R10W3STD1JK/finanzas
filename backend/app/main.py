import asyncio
import logging
from contextlib import asynccontextmanager, suppress

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api.deps import DB, current_user
from app.api.routes import accounts, auth, categories, recurring, reports, transactions
from app.config import get_settings
from app.db import SessionLocal
from app.services.bootstrap import bootstrap, run_jobs
from app.services.errors import AppError

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("finanzas")


def _run_jobs_once() -> None:
    with SessionLocal() as db:
        run_jobs(db)


async def _jobs_loop(interval_minutes: int) -> None:
    # El ordenador no está siempre encendido: se ejecuta al arrancar y luego periódicamente,
    # de modo que todo lo que venció mientras estaba apagado se pone al día.
    while True:
        await asyncio.sleep(interval_minutes * 60)
        try:
            await run_in_threadpool(_run_jobs_once)
        except Exception:
            log.exception("Error en la tarea periódica")


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    task = None
    if settings.jobs_enabled:
        with SessionLocal() as db:
            await run_in_threadpool(bootstrap, db)
        task = asyncio.create_task(_jobs_loop(settings.jobs_interval_minutes))
    yield
    if task:
        task.cancel()
        with suppress(asyncio.CancelledError):
            await task


app = FastAPI(title="Finanzas", version="0.1.0", lifespan=lifespan, docs_url="/api/docs", openapi_url="/api/openapi.json")


@app.exception_handler(AppError)
async def app_error_handler(_: Request, exc: AppError):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})


_FIELD_NAMES = {
    "amount": "importe",
    "date": "fecha",
    "concept": "concepto",
    "name": "nombre",
    "account_id": "cuenta",
    "category_id": "categoría",
    "to_account_id": "cuenta de destino",
}


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError):
    messages = []
    for err in exc.errors():
        loc = [str(p) for p in err.get("loc", []) if p not in ("body", "query", "path")]
        field = _FIELD_NAMES.get(loc[-1], loc[-1]) if loc else ""
        msg = err.get("msg", "valor no válido").removeprefix("Value error, ")
        messages.append(f"{field}: {msg}" if field else msg)
    return JSONResponse(status_code=422, content={"detail": "; ".join(messages)})


api = APIRouter(prefix="/api")


@api.get("/health", tags=["meta"])
def health(db: DB):
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


api.include_router(auth.router)
protected = [Depends(current_user)]
for module in (accounts, categories, transactions, recurring, reports):
    api.include_router(module.router, dependencies=protected)
api.include_router(reports.settings_router, dependencies=protected)
app.include_router(api)
