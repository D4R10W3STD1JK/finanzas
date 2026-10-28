#!/bin/sh
# Copias de seguridad de PostgreSQL y de los adjuntos.
#
# El equipo no está siempre encendido, así que no se usa un cron a hora fija: al arrancar
# y luego cada hora se comprueba la antigüedad de la última copia y, si supera
# BACKUP_INTERVAL_HOURS, se hace una nueva.
#
#   backup.sh          bucle (lo que ejecuta el contenedor)
#   backup.sh now      una copia inmediata
set -eu

DIR=/backups
INTERVAL_HOURS="${BACKUP_INTERVAL_HOURS:-24}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
MIN_KEEP="${BACKUP_MIN_KEEP:-7}"
export PGPASSWORD="$POSTGRES_PASSWORD"

log() { echo "$(date '+%d/%m/%Y %H:%M:%S') $*"; }

newest_age_seconds() {
    newest=$(ls -1t "$DIR"/finanzas_*.dump 2>/dev/null | head -n 1 || true)
    if [ -z "$newest" ]; then
        echo 999999999
    else
        echo $(( $(date +%s) - $(stat -c %Y "$newest") ))
    fi
}

do_backup() {
    ts=$(date +%Y%m%d_%H%M%S)
    # Nunca sobrescribir una copia existente (dos copias en el mismo segundo).
    while [ -e "$DIR/finanzas_$ts.dump" ]; do
        sleep 1
        ts=$(date +%Y%m%d_%H%M%S)
    done
    dump="$DIR/finanzas_$ts.dump"
    files="$DIR/finanzas_${ts}_adjuntos.tar.gz"
    log "Iniciando copia $ts"
    pg_dump -h "$PGHOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --file="$dump.tmp"
    mv "$dump.tmp" "$dump"
    tar -czf "$files.tmp" -C /data attachments
    mv "$files.tmp" "$files"
    log "Copia completada: $(basename "$dump") ($(du -h "$dump" | cut -f1)) + adjuntos ($(du -h "$files" | cut -f1))"
    prune
}

# Borra las copias de más de RETENTION_DAYS días, conservando siempre las MIN_KEEP más recientes.
prune() {
    now=$(date +%s)
    max_age=$(( RETENTION_DAYS * 86400 ))
    i=0
    for dump in $(ls -1t "$DIR"/finanzas_*.dump 2>/dev/null); do
        i=$(( i + 1 ))
        [ "$i" -le "$MIN_KEEP" ] && continue
        age=$(( now - $(stat -c %Y "$dump") ))
        if [ "$age" -gt "$max_age" ]; then
            base="${dump%.dump}"
            rm -f "$dump" "${base}_adjuntos.tar.gz"
            log "Copia antigua eliminada: $(basename "$dump")"
        fi
    done
    rm -f "$DIR"/*.tmp
}

wait_for_db() {
    until pg_isready -h "$PGHOST" -U "$POSTGRES_USER" -d "$POSTGRES_DB" >/dev/null 2>&1; do
        sleep 2
    done
}

mkdir -p "$DIR"
wait_for_db

if [ "${1:-}" = "now" ]; then
    do_backup
    exit 0
fi

log "Servicio de copias iniciado (cada ${INTERVAL_HOURS} h, retención ${RETENTION_DAYS} días, mínimo ${MIN_KEEP} copias)"
while true; do
    if [ "$(newest_age_seconds)" -ge $(( INTERVAL_HOURS * 3600 )) ]; then
        do_backup || log "ERROR: la copia ha fallado"
    fi
    sleep 3600
done
