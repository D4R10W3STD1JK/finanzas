"""Utilidades de línea de comandos.

    docker compose exec backend python -m app.cli seed-demo
    docker compose exec backend python -m app.cli reset-password Ronald
    docker compose exec backend python -m app.cli run-jobs
    docker compose exec -T backend python -m app.cli export > finanzas.json
    docker compose exec -T backend python -m app.cli import < finanzas.json
"""

import argparse
import getpass
import json
import sys

from sqlalchemy import func, select

from app.config import today
from app.db import SessionLocal
from app.models import User
from app.security import hash_password
from app.seed.categories import seed_default_categories
from app.seed.demo import seed_demo
from app.services import data_io
from app.services.bootstrap import run_jobs
from app.services.errors import AppError


def main() -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    demo = sub.add_parser("seed-demo", help="Carga datos de ejemplo")
    demo.add_argument("--force", action="store_true", help="Añadirlos aunque ya haya movimientos")
    reset = sub.add_parser("reset-password", help="Cambia la contraseña de un usuario")
    reset.add_argument("username")
    sub.add_parser("run-jobs", help="Genera ocurrencias y confirma las vencidas")
    exp = sub.add_parser("export", help="Escribe todos los datos en JSON por la salida estándar")
    exp.add_argument("--sin-adjuntos", action="store_true", help="No incluir los ficheros adjuntos")
    imp = sub.add_parser("import", help="Sustituye todos los datos por un JSON leído de la entrada estándar")
    imp.add_argument("--comprobar", action="store_true", help="Solo comprobar el fichero, sin importar")
    args = parser.parse_args()

    with SessionLocal() as db:
        if args.command == "seed-demo":
            seed_default_categories(db)
            try:
                seed_demo(db, today(), force=args.force)
            except RuntimeError as e:
                print(e, file=sys.stderr)
                return 1
            print("Datos de ejemplo cargados")
        elif args.command == "reset-password":
            user = db.scalar(select(User).where(func.lower(User.username) == args.username.lower()))
            if user is None:
                print(f"No existe el usuario {args.username}", file=sys.stderr)
                return 1
            password = getpass.getpass("Nueva contraseña: ")
            if len(password) < 8 or password != getpass.getpass("Repítela: "):
                print("Las contraseñas no coinciden o tienen menos de 8 caracteres", file=sys.stderr)
                return 1
            user.password_hash = hash_password(password)
            db.commit()
            print("Contraseña actualizada")
        elif args.command == "run-jobs":
            run_jobs(db)
            print("Tareas ejecutadas")
        elif args.command == "export":
            json.dump(data_io.export_data(db, not args.sin_adjuntos), sys.stdout, ensure_ascii=False, indent=1)
        elif args.command == "import":
            try:
                summary = data_io.import_data(db, json.load(sys.stdin), dry_run=args.comprobar)
            except (AppError, json.JSONDecodeError) as e:
                print(f"No se ha importado: {getattr(e, 'message', e)}", file=sys.stderr)
                return 1
            if not args.comprobar:
                run_jobs(db)
            verb = "Se importarían" if args.comprobar else "Importado"
            print(f"{verb}: " + ", ".join(f"{n} {t}" for t, n in summary["counts"].items() if n), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
