#!/usr/bin/env bash
set -euo pipefail

echo "[DEPLOY] Fetching latest code..."
git fetch --all

echo "[DEPLOY] Resetting to origin/main..."
git reset --hard origin/main

echo "[DEPLOY] Building containers..."
docker compose build

echo "[DEPLOY] Running database migrations..."
docker compose run --rm migrate

echo "[DEPLOY] Rebuilding and starting containers..."
docker compose up -d --remove-orphans

echo "[DEPLOY] Cleaning unused images..."
docker image prune -f

echo "[DEPLOY] Done."
