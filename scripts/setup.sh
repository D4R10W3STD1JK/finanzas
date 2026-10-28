#!/bin/sh
# Primera instalación: crea el fichero .env con claves aleatorias y la contraseña de Ronald,
# y arranca la aplicación.
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

echo "Contraseña para el usuario Ronald (mínimo 8 caracteres; podrás cambiarla luego en Ajustes):"
stty -echo 2>/dev/null || true
read -r password
stty echo 2>/dev/null || true
echo
if [ "${#password}" -lt 8 ]; then
    echo "La contraseña es demasiado corta."
    exit 1
fi
case "$password" in
    *[\\\"\'\$\`\|\&]*) echo "Usa una contraseña sin comillas, barras invertidas ni los símbolos \$ \` | &."; exit 1 ;;
esac

sed -e "s|^ADMIN_PASSWORD=.*|ADMIN_PASSWORD=$password|" \
    -e "s|^SECRET_KEY=.*|SECRET_KEY=$(random 32)|" \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(random 16)|" \
    .env.example > .env
chmod 600 .env 2>/dev/null || true
echo "Creado .env"

echo "Construyendo y arrancando la aplicación (la primera vez tarda unos minutos)..."
docker compose up -d --build
port=$(grep -E '^APP_PORT=' .env | cut -d= -f2)
echo
echo "Listo. Abre http://localhost:${port:-8080} y entra con el usuario Ronald."
