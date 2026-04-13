FROM python:3.14.3-slim-trixie
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

ENV UV_COMPILE_BYTECODE=1 \
  UV_LINK_MODE=copy \
  UV_PROJECT_ENVIRONMENT=/app/.venv \
  PYTHONDONTWRITEBYTECODE=1 \
  PYTHONUNBUFFERED=1 \
  PYTHONIOENCODING=utf-8 \
  PATH="/app/.venv/bin:${PATH}" \
  PLATFORM_PORT=8000

RUN apt-get update \
  && apt-get install -y --no-install-recommends dumb-init \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies before copying source for better layer caching
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
  uv sync --locked --no-dev --no-install-project

# Copy application source
COPY . .

# Sync the project itself
RUN --mount=type=cache,target=/root/.cache/uv \
  uv sync --locked --no-dev

RUN useradd --system --create-home --uid 10001 appuser \
  && chown -R appuser:appuser /app

USER appuser
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD python -c "import os,urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.getenv(\"PLATFORM_PORT\",\"8000\")}/api/v1/health', timeout=5).read()" || exit 1

# dumb-init ensures proper PID 1 behaviour: signal forwarding and zombie reaping
CMD ["dumb-init", "python", "app.py"]
