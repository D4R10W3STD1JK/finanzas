# Finanzas

Aplicación web de finanzas personales, autoalojada y para un solo usuario. Gestiona cuentas, movimientos, recurrentes (nóminas, recibos, suscripciones), categorías y adjuntos. Funciona en español, en euros y con formato español (1.234,56 €, dd/mm/aaaa).

- **Backend:** Python 3.13, FastAPI, SQLAlchemy 2, Alembic y PostgreSQL 17.
- **Frontend:** React 19, Vite, TypeScript, Tailwind 4 y TanStack Query, servido con nginx.
- **Copias de seguridad:** un contenedor propio con `pg_dump` y los adjuntos.

## Instalación en el PC

La app se ejecuta en el propio PC con Docker y se usa desde el navegador, en ese PC o en cualquier móvil o tablet de la misma wifi. No necesita internet salvo para instalarla y actualizarla.

### 1. Instalar Docker (solo la primera vez)

- **Windows 10/11:**
  1. Instala [Docker Desktop](https://www.docker.com/products/docker-desktop/). Si lo pide, acepta activar WSL 2 y reinicia.
  2. En Docker Desktop → *Settings → General*, activa **Start Docker Desktop when you sign in**. Así la app arranca sola al encender el PC.
  3. Instala [Git for Windows](https://git-scm.com/download/win). Incluye **Git Bash**, la terminal desde la que se ejecutan los scripts `./scripts/…`.
- **Linux:** instala Docker Engine con el plugin `docker compose`, y habilita el servicio con `sudo systemctl enable --now docker`.

### 2. Instalar la app

Abre una terminal (Git Bash en Windows) y ejecuta:

```sh
git clone <dirección-del-repositorio> finanzas   # o copia la carpeta desde un USB
cd finanzas
./scripts/setup.sh
```

`setup.sh` pide la contraseña de **Ronald**. Después crea el fichero `.env` con claves aleatorias y arranca la app (la primera vez tarda unos minutos).

Si prefieres hacerlo a mano: copia `.env.example` a `.env`, cambia `ADMIN_PASSWORD`, `SECRET_KEY` y `POSTGRES_PASSWORD`, y ejecuta `docker compose up -d --build`.

### 3. Entrar

- **En el PC:** http://localhost:8080
- **En el móvil o la tablet** (en la misma wifi): `http://IP-DEL-PC:8080`. La IP se consulta con `ipconfig` en Windows o con `ip addr` en Linux, y suele ser del tipo 192.168.1.x. Conviene fijarla en el router para que no cambie.

Entra con **Ronald** y la contraseña que elegiste. Puedes cambiarla en **Ajustes**; desde ese momento la de `.env` ya no se usa.

Los servicios se reinician solos. Basta con encender el PC y esperar a que Docker arranque, normalmente menos de un minuto.

> Mantén `COOKIE_SECURE=false` mientras se acceda por `http://`. Si algún día se publica por HTTPS (con un proxy inverso o Tailscale), cámbialo a `true`.

## Primeros pasos (empezando desde 0 €)

1. **Cuentas:** crea la cuenta del banco, el efectivo y la tarjeta, si la hay. Pon como saldo inicial lo que hay hoy en cada una (0 € si se empieza de cero) con la fecha de hoy. En la tarjeta de crédito, el saldo es lo que se debe, en negativo.
2. **Recurrentes:** da de alta la pensión o nómina, el alquiler, la luz, el agua, los seguros, el IBI, las suscripciones…
   - Con importe fijo se apuntan solos cada vez.
   - Con importe variable (la luz) aparecen como «pendientes» en Inicio para confirmar el importe real.
   - Si su primer pago fue antes de hoy, deja **sin marcar** «Registrar también lo anterior a hoy». Esos pagos ya están reflejados en el saldo inicial.
3. **Día a día:** apunta los gastos que no se repiten (supermercado, gasolina…) con «Nuevo movimiento». Se puede adjuntar la foto del ticket.
4. **Cuadrar el saldo:** cada cierto tiempo, compara el saldo con el del banco. Si no coincide, usa **Cuentas → Conciliar**.
5. **Planificar:** revisa **Previsión**, que avisa si el saldo se quedaría en negativo, y **Provisiones**, que dice cuánto apartar para el IBI y los seguros. Cuando haya un par de meses de datos, crea **Presupuestos** y **Objetivos**.

### Datos de ejemplo (solo para probar)

```sh
docker compose exec backend python -m app.cli seed-demo
```

Carga 4 cuentas, 14 recurrentes, un año de movimientos, presupuestos y objetivos. Para volver a dejar la app vacía, **borrando todos los datos**:

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
- **Presupuestos:**
  - Cada categoría de gasto tiene un límite mensual, el mismo todos los meses. Si es una categoría principal, incluye sus subcategorías.
  - Se puede poner un importe distinto en un mes concreto (por ejemplo, más ocio en agosto).
  - La barra cambia de color al llegar al porcentaje de aviso (80 % por defecto) y al superarse. Una marca indica el día del mes en que estamos.
  - La parte clara de la barra es lo que ya está previsto por recurrentes, con aviso si al sumarlo se superaría el límite.
  - Se muestra el gasto en categorías sin presupuesto, con un botón para crearlo. Los presupuestos que necesitan atención aparecen en Inicio.
- **Objetivos de ahorro:**
  - Cada objetivo tiene un importe y una fecha opcional. El progreso sale del **saldo de una cuenta vinculada** o de **aportaciones apuntadas a mano** (también retiradas), a elegir en cada objetivo.
  - Muestra cuánto hay que ahorrar al mes para llegar a tiempo, el ritmo de los últimos 3 meses y si vas bien o por detrás.
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

## Exportar e importar los datos (JSON)

En **Ajustes → Exportar e importar datos**:

- **Exportar todo** descarga un fichero `.json` con todos los datos: cuentas, movimientos, recurrentes, presupuestos, objetivos, preferencias y, si se marca la opción, los tickets y facturas. Sirve como copia en un USB o para pasar los datos a otro equipo. No incluye la contraseña.
- **Importar desde un fichero**:
  - Primero enseña qué contiene el fichero y pide confirmación.
  - Después **sustituye todos los datos actuales** por los del fichero. Si algo falla, no se cambia nada.
  - Se pueden importar ficheros exportados con versiones anteriores de la app.

También desde la terminal:

```sh
docker compose exec -T backend python -m app.cli export > finanzas.json
docker compose exec -T backend python -m app.cli import --comprobar < finanzas.json   # solo comprueba
docker compose exec -T backend python -m app.cli import < finanzas.json
```

## Actualizar la aplicación

```sh
./scripts/backup-now.sh          # por precaución
git pull                         # o copia la nueva versión de la carpeta (conserva tu .env)
docker compose up -d --build
```

Las migraciones de la base de datos se aplican solas al arrancar el backend.

## Mover la aplicación a otro equipo

La forma más sencilla:

1. En el equipo antiguo, ve a **Ajustes → Exportar todo**, con los adjuntos marcados.
2. Instala la app en el nuevo con `./scripts/setup.sh`.
3. En el nuevo, ve a **Ajustes → Importar desde un fichero**.

Otra opción es usar las copias de seguridad:

1. En el equipo antiguo, ejecuta `./scripts/backup-now.sh`.
2. Copia el `.dump` y el `_adjuntos.tar.gz` a la carpeta `backups/` del nuevo.
3. En el nuevo, ejecuta `./scripts/restore.sh backups/finanzas_….dump`.

## Problemas frecuentes

- **La página no carga:** comprueba que Docker Desktop está abierto y ejecuta `docker compose ps`. Los cuatro servicios deben aparecer como `Up`; el backend y la base de datos, además, como `healthy`. Si alguno no está, ejecuta `docker compose up -d`.
- **El puerto 8080 está ocupado:** cambia `APP_PORT` en `.env`, por ejemplo a `8090`, y ejecuta `docker compose up -d`.
- **No entra desde el móvil:** el móvil tiene que estar en la misma wifi. En Windows, acepta el aviso del cortafuegos para Docker la primera vez o permite el puerto 8080.
- **Contraseña olvidada:** `docker compose exec backend python -m app.cli reset-password Ronald`.
- **Ver qué está pasando:** `docker compose logs -f backend`.

## Utilidades

```sh
docker compose exec backend python -m app.cli reset-password Ronald  # si olvidas la contraseña
docker compose exec backend python -m app.cli run-jobs               # forzar generación/confirmación de recurrentes
docker compose exec -T backend python -m app.cli export > datos.json  # exportar todo a JSON
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
  app/services/    lógica de negocio (saldos, recurrentes, informes, previsión, presupuestos, exportación)
  app/api/routes/  endpoints REST bajo /api (documentación en /api/docs)
  app/seed/        categorías iniciales y datos de ejemplo
  alembic/         migraciones
  tests/           pytest contra PostgreSQL real
frontend/src/
  api/             cliente tipado (generado desde OpenAPI) y hooks de React Query
  components/      UI común, selectores de importe/fecha/categoría…
  pages/           pantallas
backup/            imagen del servicio de copias
scripts/           setup (primera instalación), backup-now, restore, gen-api
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
