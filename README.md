# Finanzas

Aplicación web de finanzas personales, autoalojada y para un solo usuario. Gestiona cuentas, movimientos, recurrentes (nóminas, recibos, suscripciones), categorías y adjuntos. Funciona en español, en euros y con formato español (1.234,56 €, dd/mm/aaaa).

- **Backend:** Python 3.13, FastAPI, SQLAlchemy 2, Alembic y PostgreSQL 17.
- **Frontend:** React 19, Vite, TypeScript, Tailwind 4 y TanStack Query, servido con nginx.
- **Copias de seguridad:** un contenedor propio con `pg_dump` y los adjuntos.

## Instalación

### Requisitos

- Un equipo x86-64 con **Docker** y **Docker Compose v2**:
  - **Linux:** Docker Engine con el plugin `docker compose`.
  - **Windows/macOS:** Docker Desktop. En sus ajustes, activa *Start Docker Desktop when you sign in* para que la app arranque al encender el PC.

### Pasos

1. Copia la carpeta del proyecto al equipo (por ejemplo con `git clone` o un USB).
2. Crea el fichero de configuración:
   ```sh
   cp .env.example .env
   ```
3. Edita `.env` y cambia al menos estos valores:
   - `ADMIN_PASSWORD`: la contraseña inicial de **Ronald**.
   - `SECRET_KEY`: genera una con `openssl rand -hex 32`.
   - `POSTGRES_PASSWORD`.
4. Arranca la aplicación:
   ```sh
   docker compose up -d
   ```
5. Abre **http://localhost:8080** y entra con `Ronald` y la contraseña de `.env`.
6. Cambia la contraseña en **Ajustes**. A partir de ese momento, el valor de `.env` ya no se usa.

Los servicios se reinician solos (`restart: unless-stopped`). Basta con encender el equipo y esperar a que Docker arranque.

### Acceso desde el móvil

El móvil tiene que estar en la misma red wifi. Abre `http://IP-DEL-EQUIPO:8080`. La IP se consulta con `ip addr` en Linux o `ipconfig` en Windows.

Mantén `COOKIE_SECURE=false` mientras accedas por HTTP. Si algún día la publicas por HTTPS (con un proxy inverso o Tailscale), cámbialo a `true`.

### Datos de ejemplo (opcional)

```sh
docker compose exec backend python -m app.cli seed-demo
```

Carga 4 cuentas, 14 recurrentes y un año de movimientos. Para volver a empezar de cero **borrando todos los datos**:

```sh
docker compose down -v && docker compose up -d
```

## Uso: pantallas

- **Inicio:**
  - Saldo total, y los ingresos, gastos y ahorro del mes, comparados con el mes anterior y con la media de los 12 meses anteriores (solo cuenta los meses con datos).
  - Tasa de ahorro, gastos por categoría y evolución de los últimos 12 meses, con vista de tabla.
  - Pendientes de confirmar y próximos 30 días.
  - Con las flechas se consulta cualquier mes. Al pulsar una categoría se abren sus movimientos de ese mes.
- **Previsión:**
  - Proyecta el saldo a 3, 6 o 12 meses a partir del saldo real de hoy. Suma los recurrentes previstos, los vencidos sin confirmar y los movimientos apuntados con fecha futura.
  - Opcionalmente añade el gasto no recurrente habitual: la media de los últimos 6 meses completos, repartida por días. Sin historial cuenta como 0.
  - Avisa cuando el saldo total bajaría del umbral, que por defecto es 0 € y se cambia en Ajustes o en la propia pantalla. También avisa cuando una cuenta se quedaría en negativo o una tarjeta superaría su límite. El aviso aparece además en Inicio.
- **Provisiones (hucha virtual):**
  - Para cada gasto que no es mensual (trimestral, semestral, anual…) calcula cuánto deberías llevar apartado hoy y cuánto apartar al mes para llegar al próximo pago.
  - La hucha empieza a llenarse en el último pago o, si empezaste a seguir el gasto después, en ese momento. Nunca se supone que había dinero apartado antes de usar la app.
  - Es un cálculo teórico: no mueve dinero.
- **Gastos fijos:** cada recurrente convertido a su coste mensual y anual, sea cual sea su frecuencia. En los recibos variables se usa la media real de los últimos 12 meses.
- **Suscripciones:** coste mensual y anual, próxima renovación (resaltada si faltan 7 días o menos) y lo pagado en el último año. Un recurrente aparece aquí al marcar «Es una suscripción».

Las transferencias y los ajustes de saldo nunca cuentan como ingreso ni como gasto.

## Uso: recurrentes

- **Frecuencias:** diaria, semanal, mensual, trimestral, semestral, anual o personalizada ("cada N días, semanas o meses").
- **Día de cobro:**
  - Puede ser un día fijo, el último del mes o el mismo día que la fecha de inicio.
  - Si eliges el día 31, en los meses cortos se usa el último día. Al mes siguiente vuelve al 31, sin ir desplazándose.
- **Fin de semana o festivo:**
  - Puede moverse al día hábil anterior o al siguiente.
  - Tiene en cuenta los festivos nacionales y los de la Comunitat Valenciana (configurable con `HOLIDAYS_SUBDIV`).
- **Importe fijo:** se confirma solo al llegar su fecha. Se puede desactivar en cada serie.
- **Importe variable** (como la luz): queda **pendiente** en el Inicio hasta que confirmas el importe real.
- **Editar una ocurrencia:** cambia solo esa y la deja en modo manual (ya no se confirma sola). Con «Volver a los valores de la serie» se deshace.
- **Cambiar importe o condiciones «a partir de una fecha»** (por ejemplo, una subida del alquiler):
  - Las ocurrencias anteriores y las ya confirmadas no cambian, así que se conserva el histórico.
  - La serie guarda cada cambio con su fecha.
- **Recurrente con fecha de inicio pasada:** por defecto solo se generan las ocurrencias desde hoy, para no descuadrar saldos que ya incluyen esos pagos. Marca «Registrar también lo anterior a hoy» si quieres el historial.
- **Equipo apagado:** si el equipo pasa días apagado, al encenderlo se confirman los pagos vencidos y se generan las ocurrencias futuras, hasta 18 meses por delante. Mientras está encendido, esto se repite cada hora.

## Copias de seguridad

### Cómo funcionan

- El servicio `backup` guarda en la carpeta **`./backups`** (configurable con `BACKUP_DIR`) dos ficheros por copia:
  - `finanzas_AAAAMMDD_HHMMSS.dump`: la base de datos.
  - `finanzas_AAAAMMDD_HHMMSS_adjuntos.tar.gz`: los tickets y facturas.
- Como el equipo no está siempre encendido, no se usa una hora fija. Al arrancar, y luego cada hora, se comprueba si la última copia tiene más de `BACKUP_INTERVAL_HOURS` (24 por defecto) y, si es así, se hace una nueva.
- **Retención:**
  - Se borran las copias con más de `BACKUP_RETENTION_DAYS` días (30 por defecto).
  - Siempre se conservan al menos las `BACKUP_MIN_KEEP` más recientes (7 por defecto), aunque el equipo haya pasado meses apagado.

**Recomendación:** copia de vez en cuando la carpeta `backups/` a un USB o a la nube. Si el disco del equipo falla, las copias que estén en ese mismo disco también se pierden.

### Copia manual

```sh
./scripts/backup-now.sh
```

### Restaurar

```sh
./scripts/restore.sh                                        # lista las copias disponibles
./scripts/restore.sh backups/finanzas_20261028_220000.dump  # restaura esa copia
```

El script pide confirmación y antes hace una copia del estado actual, por si acaso. Después restaura la base de datos y los adjuntos y vuelve a arrancar la app.

> En Windows, los scripts `.sh` se ejecutan desde **Git Bash** o **WSL**.

## Actualizar la aplicación

```sh
./scripts/backup-now.sh          # por precaución
git pull                         # o copia la nueva versión de la carpeta (conserva tu .env)
docker compose up -d --build
```

Las migraciones de la base de datos se aplican solas al arrancar el backend.

## Mover la aplicación a otro equipo

1. En el equipo antiguo, haz una copia con `./scripts/backup-now.sh`.
2. En el nuevo, instala la app como se explica arriba, usando el mismo `.env`.
3. Copia el `.dump` y el `_adjuntos.tar.gz` a `backups/`.
4. Ejecuta `./scripts/restore.sh backups/finanzas_….dump`.

## Utilidades

```sh
docker compose exec backend python -m app.cli reset-password Ronald  # si olvidas la contraseña
docker compose exec backend python -m app.cli run-jobs               # forzar generación/confirmación de recurrentes
docker compose logs -f backend                                       # ver registros
docker compose ps                                                    # estado de los servicios
```

## Desarrollo

### Estructura

```
backend/
  app/domain/      lógica pura (motor de recurrencias, calendario de festivos)
  app/models/      modelos SQLAlchemy
  app/schemas/     esquemas Pydantic (entrada/salida de la API)
  app/services/    lógica de negocio (saldos, movimientos, series y ocurrencias)
  app/api/routes/  endpoints REST bajo /api (documentación en /api/docs)
  app/seed/        categorías iniciales y datos de ejemplo
  alembic/         migraciones
  tests/           pytest contra PostgreSQL real
frontend/src/
  api/             cliente tipado (generado desde OpenAPI) y hooks de React Query
  components/      UI común, selectores de importe/fecha/categoría…
  pages/           pantallas
backup/            imagen del servicio de copias
scripts/           backup-now, restore, gen-api
```

### Tests

```sh
docker compose --profile test run --rm tests
```

Usan una base de datos `finanzas_test`, que se crea y se borra sola en el mismo servidor de PostgreSQL.

### Frontend en modo desarrollo

```sh
cd frontend && npm install && npm run dev   # http://localhost:5173, con proxy de /api a localhost:8000
```

Para ello el backend tiene que escuchar en `localhost:8000`. Puedes publicar el puerto en un `docker-compose.override.yml`.

### Cambiar el esquema de la base de datos

```sh
docker compose --profile test run --rm --user "$(id -u):$(id -g)" tests alembic revision --autogenerate -m "descripción"
./scripts/gen-api.sh   # si cambian los esquemas de la API, regenera los tipos del frontend
```

### Notas de diseño

- Los importes se guardan como `NUMERIC(14,2)` y viajan como cadena en JSON. En ningún punto se usa `float`.
- El importe es siempre positivo y el signo lo da el tipo (ingreso o gasto). Los ajustes de conciliación son la excepción: llevan signo.
- Las transferencias son un único movimiento con cuenta de origen y de destino, y no cuentan como ingreso ni como gasto.
- El saldo de cada cuenta se calcula como el saldo inicial más los movimientos hasta hoy. Los movimientos con fecha futura no afectan al saldo actual.
- Ya están preparados, para fases posteriores: `transactions.import_hash` e `import_batch_id` (importación de extractos) e `is_deductible` (renta).
