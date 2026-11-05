"""Utilidades de línea de comandos.

    docker compose exec backend python -m app.cli create-user Ana
    docker compose exec backend python -m app.cli reset-password Ronald
    docker compose exec backend python -m app.cli seed-demo --usuario Ana
    docker compose exec backend python -m app.cli run-jobs
    docker compose exec -T backend python -m app.cli export --usuario Ronald > finanzas.json
    docker compose exec -T backend python -m app.cli import --usuario Ronald < finanzas.json

Cada usuario tiene sus propios datos. `--usuario` se puede omitir si solo hay uno.
"""

import argparse
import getpass
import json
import sys

from app.config import today
from app.db import SessionLocal
from app.security import hash_password
from app.seed.categories import seed_default_categories
from app.seed.demo import seed_demo
from app.services import data_io
from app.services.bootstrap import run_jobs
from app.services.recurring import sync_all
from app.services.errors import AppError
from app.services.users import create_user, find_user, list_users
from app.tenancy import set_current_user


def _ask_password() -> str | None:
    password = getpass.getpass("Contraseña: ")
    if len(password) < 8 or password != getpass.getpass("Repítela: "):
        print("Las contraseñas no coinciden o tienen menos de 8 caracteres", file=sys.stderr)
        return None
    return password


def _pick_user(db, username: str | None):
    if username:
        user = find_user(db, username)
        if user is None:
            print(f"No existe el usuario {username}", file=sys.stderr)
        return user
    users = list_users(db)
    if len(users) == 1:
        return users[0]
    names = ", ".join(u.username for u in users) or "ninguno"
    print(f"Indica de quién son los datos con --usuario (usuarios: {names})", file=sys.stderr)
    return None


def main() -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="command", required=True)
    new = sub.add_parser("create-user", help="Crea un usuario con sus propias finanzas")
    new.add_argument("username")
    demo = sub.add_parser("seed-demo", help="Carga datos de ejemplo")
    demo.add_argument("--force", action="store_true", help="Añadirlos aunque ya haya movimientos")
    reset = sub.add_parser("reset-password", help="Cambia la contraseña de un usuario")
    reset.add_argument("username")
    sub.add_parser("run-jobs", help="Genera ocurrencias y confirma las vencidas (de todos los usuarios)")
    exp = sub.add_parser("export", help="Escribe los datos de un usuario en JSON por la salida estándar")
    exp.add_argument("--sin-adjuntos", action="store_true", help="No incluir los ficheros adjuntos")
    imp = sub.add_parser("import", help="Sustituye los datos de un usuario por un JSON leído de la entrada estándar")
    imp.add_argument("--comprobar", action="store_true", help="Solo comprobar el fichero, sin importar")
    for p in (demo, exp, imp):
        p.add_argument("--usuario", help="Usuario cuyos datos se usan (obligatorio si hay varios)")
    args = parser.parse_args()

    with SessionLocal() as db:
        if args.command in ("seed-demo", "export", "import"):
            user = _pick_user(db, args.usuario)
            if user is None:
                return 1
            set_current_user(db, user.id)

        if args.command == "create-user":
            password = _ask_password()
            if password is None:
                return 1
            try:
                create_user(db, args.username, password)
            except AppError as e:
                print(e.message, file=sys.stderr)
                return 1
            print(f"Usuario {args.username.strip()} creado")
        elif args.command == "seed-demo":
            seed_default_categories(db)
            try:
                seed_demo(db, today(), force=args.force)
            except RuntimeError as e:
                print(e, file=sys.stderr)
                return 1
            print("Datos de ejemplo cargados")
        elif args.command == "reset-password":
            user = find_user(db, args.username)
            if user is None:
                print(f"No existe el usuario {args.username}", file=sys.stderr)
                return 1
            password = _ask_password()
            if password is None:
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
                sync_all(db, today())  # pone al día los recurrentes importados
            verb = "Se importarían" if args.comprobar else "Importado"
            print(f"{verb}: " + ", ".join(f"{n} {t}" for t, n in summary["counts"].items() if n), file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
