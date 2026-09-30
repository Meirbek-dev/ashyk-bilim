#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
export REWRITE_IMAGE_TAG="${REWRITE_IMAGE_TAG:-$(git rev-parse --short=8 HEAD)}"
compose=(docker compose -f docker-compose.yml -f docker-compose.rewrite.yml -f docker-compose.cutover.yml)

# Initial legacy data/identity import is a separate one-time operation:
# docs/rewrite/MIGRATION.md. This script updates an already migrated site.
"${compose[@]}" config --quiet
echo "[DEPLOY] Building Rust and frontend release $REWRITE_IMAGE_TAG..."
"${compose[@]}" build server web

echo "[DEPLOY] Applying Rust database migrations..."
"${compose[@]}" run --rm --no-deps server-migrate

echo "[DEPLOY] Starting the release..."
"${compose[@]}" up -d --no-deps --wait server worker web
"${compose[@]}" up -d --no-deps nginx
# Upstream container addresses can change even when nginx itself is unchanged.
"${compose[@]}" exec -T nginx nginx -t
"${compose[@]}" exec -T nginx nginx -s reload
"${compose[@]}" exec -T server curl -fsS http://127.0.0.1:8000/api/v2/health/ready
echo "[DEPLOY] Done. Previous images and legacy data retained for rollback."
