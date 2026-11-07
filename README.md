# Finanzas

App web de finanzas personales, autoalojada y multiusuario: cada persona crea su cuenta y solo ve sus propias cuentas, movimientos, recurrentes, presupuestos y objetivos. Hecha con FastAPI, PostgreSQL y React, y se lanza con Docker.

## Requisitos

- Docker con `docker compose` (en Windows: Docker Desktop y Git Bash).

## Lanzar la app

```sh
git clone <dirección-del-repositorio> finanzas
cd finanzas
./scripts/setup.sh
```

`setup.sh` crea el `.env` con claves aleatorias y arranca los servicios. La primera vez tarda unos minutos.

Si prefieres hacerlo a mano:

```sh
cp .env.example .env    # cambia SECRET_KEY y POSTGRES_PASSWORD
docker compose up -d --build
```

## Crear tu cuenta

Abre http://localhost:8080, o `http://IP-DEL-PC:8080` desde otro dispositivo de la misma red. En una instalación nueva aparece directamente la pantalla para crear la primera cuenta. Después, cualquiera puede crear la suya con **Crear una cuenta** (se desactiva con `ALLOW_REGISTRATION=false` en `.env`).

Al crear la cuenta se elige el país y la región. Con eso, los pagos recurrentes que caen en festivo se mueven al día hábil. Se puede cambiar después en **Ajustes → Festivos**.

## Comandos útiles

```sh
docker compose ps                 # estado de los servicios
docker compose logs -f backend    # ver registros
docker compose down               # parar
docker compose up -d --build      # actualizar tras un git pull
```

Manual completo (uso, copias de seguridad, usuarios, desarrollo): [docs/MANUAL.md](docs/MANUAL.md).
