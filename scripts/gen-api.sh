#!/bin/sh
# Regenera los tipos TypeScript del frontend a partir de la API del backend.
# Ejecutar tras cambiar esquemas o rutas del backend.
set -eu
cd "$(dirname "$0")/.."
docker compose --profile test run --rm --no-deps -T tests \
    python -c "import json; from app.main import app; print(json.dumps(app.openapi(), ensure_ascii=False))" \
    > frontend/openapi.json
cd frontend && npm run gen:api
