#!/bin/sh
# Primera instalación: crea el fichero .env con claves aleatorias y arranca la aplicación.
# La primera cuenta se crea después, desde el navegador.
#
#   ./scripts/setup.sh
set -eu
cd "$(dirname "$0")/.."

if [ -f .env ]; then
    echo "Ya existe un fichero .env: no se toca. Si quieres empezar de cero, bórralo antes."
    exit 1
fi

random() {
    # openssl está en Linux, macOS y Git Bash; si no, se usa /dev/urandom.
    openssl rand -hex "$1" 2>/dev/null || head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'
}

sed -e "s|^SECRET_KEY=.*|SECRET_KEY=$(random 32)|" \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(random 16)|" \
    .env.example > .env
chmod 600 .env 2>/dev/null || true
echo "Creado .env"

echo "Construyendo y arrancando la aplicación (la primera vez tarda unos minutos)..."
docker compose up -d --build
port=$(grep -E '^APP_PORT=' .env | cut -d= -f2)
echo
echo "Listo. Abre http://localhost:${port:-8080} y crea tu cuenta."
