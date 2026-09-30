#!/usr/bin/env bash
# Build and roll out the checked-out revision. Pull the desired revision first.
set -euo pipefail

cd "$(dirname "$0")/.."
export IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short=8 HEAD)}"
compose=(docker compose)

"${compose[@]}" config --quiet
echo "[DEPLOY] Building release $IMAGE_TAG..."
"${compose[@]}" build server web

echo "[DEPLOY] Applying database migrations..."
"${compose[@]}" run --rm --no-deps server-migrate

echo "[DEPLOY] Starting the release..."
"${compose[@]}" up -d --no-deps --wait server worker web
"${compose[@]}" up -d --no-deps nginx
# Upstream container addresses can change even when nginx itself is unchanged.
"${compose[@]}" exec -T nginx nginx -t
"${compose[@]}" exec -T nginx nginx -s reload
"${compose[@]}" exec -T server curl -fsS http://127.0.0.1:8000/api/v2/health/ready
echo "[DEPLOY] Done. Previous images are retained for rollback (IMAGE_TAG=<old sha>)."
