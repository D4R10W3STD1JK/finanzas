#!/bin/sh
set -e
echo "Aplicando migraciones de la base de datos..."
alembic upgrade head
exec "$@"
