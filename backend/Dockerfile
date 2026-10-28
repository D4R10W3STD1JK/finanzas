FROM python:3.13-slim AS base
COPY --from=ghcr.io/astral-sh/uv:0.9 /uv /usr/local/bin/uv
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH"
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Imagen para ejecutar los tests: docker compose --profile test run --rm tests
FROM base AS test
RUN uv sync --frozen --no-install-project
COPY . .
CMD ["pytest"]

FROM base AS runtime
COPY . .
RUN useradd --uid 1000 --create-home app && mkdir -p /data/attachments && chown -R app /data
USER app
EXPOSE 8000
ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips", "*"]
