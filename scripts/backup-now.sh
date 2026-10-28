#!/bin/sh
# Hace una copia de seguridad inmediata (además de las automáticas).
set -eu
cd "$(dirname "$0")/.."
docker compose exec -T backup /usr/local/bin/backup.sh now
