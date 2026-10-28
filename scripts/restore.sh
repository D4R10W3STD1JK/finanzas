#!/bin/sh
# Restaura una copia de seguridad (base de datos + adjuntos).
#
#   ./scripts/restore.sh                                  lista las copias disponibles
#   ./scripts/restore.sh backups/finanzas_20261028_220000.dump
#
# Ejecútalo desde la carpeta del proyecto con los servicios levantados.
set -eu

cd "$(dirname "$0")/.."
BACKUP_DIR=$(grep -E '^BACKUP_DIR=' .env 2>/dev/null | cut -d= -f2- || true)
BACKUP_DIR=${BACKUP_DIR:-./backups}

if [ $# -eq 0 ]; then
    echo "Copias disponibles en $BACKUP_DIR (más reciente primero):"
    ls -1t "$BACKUP_DIR"/finanzas_*.dump 2>/dev/null || echo "  (ninguna)"
    echo
    echo "Uso: $0 <fichero .dump>"
    exit 1
fi

DUMP=$1
[ -f "$DUMP" ] || { echo "No existe el fichero $DUMP"; exit 1; }
FILES="${DUMP%.dump}_adjuntos.tar.gz"

echo "Se va a restaurar: $DUMP"
[ -f "$FILES" ] && echo "Adjuntos:          $FILES" || echo "Aviso: no hay copia de adjuntos asociada; se conservan los actuales."
echo
echo "ATENCIÓN: se reemplazarán TODOS los datos actuales por los de la copia."
printf "Escribe 'restaurar' para continuar: "
read -r answer
[ "$answer" = "restaurar" ] || { echo "Cancelado."; exit 1; }

# Trabajar sobre una copia temporal: la copia de seguridad previa no puede tocar el fichero a restaurar.
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
cp "$DUMP" "$TMP/restore.dump"
[ -f "$FILES" ] && cp "$FILES" "$TMP/restore_adjuntos.tar.gz"
DUMP="$TMP/restore.dump"
FILES="$TMP/restore_adjuntos.tar.gz"

echo "Haciendo una copia de los datos actuales por seguridad..."
docker compose exec -T backup /usr/local/bin/backup.sh now

echo "Deteniendo la aplicación..."
docker compose stop frontend backend

echo "Restaurando la base de datos..."
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --single-transaction' < "$DUMP"

if [ -f "$FILES" ]; then
    echo "Restaurando los adjuntos..."
    docker compose run --rm --no-deps -T --user root --entrypoint sh backend \
        -c 'find /data/attachments -mindepth 1 -delete && tar -xzf - -C /data && chown -R 1000 /data/attachments' < "$FILES"
fi

echo "Arrancando la aplicación..."
docker compose up -d
echo "Restauración completada."
