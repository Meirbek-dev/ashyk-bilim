#!/usr/bin/env bash
# A healthy PING must also mean sessions can be written and survive a restart.
source "$(dirname "$0")/../scripts/lib.sh"
use_smoke
export COMPOSE_FILE=$COMPOSE_FILE:infra/compose.redis-check.yaml
export COMPOSE_PROJECT_NAME=ashyq-redis-$$ IMAGE_TAG=ci
trap 'rc=$?; if [[ $rc != 0 ]]; then compose logs --tail 10 redis >&2; fi; compose down -v --remove-orphans >/dev/null 2>&1' EXIT
prepare_redis_volume
compose up -d --no-deps --wait redis >/dev/null
mkdir -p "${BACKUP_DIR:-tmp/smoke/backups}"
# Mounting the backup while Redis has not saved yet must preserve its directory owner.
compose run --rm -T --no-deps --entrypoint /bin/true backup
log "backup mounted"
compose exec -T redis sh -ec '
  stat -c "Redis data owner: %u" /data
  redis-cli -e SET persistence-check preserved
  redis-cli -e SAVE
'
compose restart redis >/dev/null
compose up -d --no-deps --wait redis >/dev/null
compose exec -T redis sh -ec 'test "$(redis-cli --raw GET persistence-check)" = preserved'
log "Redis snapshot and restart ok"
