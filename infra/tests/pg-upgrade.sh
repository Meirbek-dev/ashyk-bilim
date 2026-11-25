#!/usr/bin/env bash
# Rehearsal of infra/scripts/pg-upgrade.sh (RUNBOOK 3.15) on a throwaway project of the production files
# (compose.yaml + compose.prod.yaml, smoke's throwaway secrets, no published ports, only the databases started):
# db and zitadel-db set up on the previous major (PG_UPGRADE_FROM, an override file), seeded with roles, a pgvector
# column, a database named after a superuser that is not "postgres" (prod's cs_mooc) and Zitadel's database; then
# upgraded to the major of compose.yaml. Checks --pending before and after, the version, the data, the extension,
# the owners, the old cluster kept beside the new one and the WAL archive moved aside.
# Removed on exit. `just pg-upgrade-test` (in ci-infra); about two minutes (builds the upgrade image).
source "$(dirname "$0")/../scripts/lib.sh"
[[ -n $CTR ]] || die "pg-upgrade-test: no container runtime"
from=${PG_UPGRADE_FROM:-docker.io/pgvector/pgvector:0.8.7-pg18-trixie@sha256:ab49524d18df7200b74ac9a475e1db6297fc1eb57da4c214c63d10ecc4b754fa}

work=$ROOT/tmp/pg-upgrade-check-$$
if command -v cygpath >/dev/null; then work=$(cygpath -m "$work"); fi
files=compose.yaml:compose.prod.yaml
export STACK=custom COMPOSE_FILE=$files:$work/old.yaml COMPOSE_PROJECT_NAME=ashyq-pgup-check-$$
export COMPOSE_ENV_FILES=$work/.env SERVER_ENV_FILE=$work/server.env IMAGE_TAG=rehearsal COMPOSE_PROFILES=
export PG_UPGRADE_YES=1 COMPOSE_PROGRESS=quiet
mkdir -p "$work/backups/pitr" "$work/backups/pitr-zitadel"
grep -v -e '^BACKUP_DIR=' -e '^POSTGRES_USER=' infra/env/smoke.env >"$COMPOSE_ENV_FILES"
printf 'BACKUP_DIR=%s\nPOSTGRES_USER=rehearsal\n' "$work/backups" >>"$COMPOSE_ENV_FILES"
cp infra/env/smoke.server.env "$SERVER_ENV_FILE"
printf 'services:\n  db: {image: "%s"}\n  zitadel-db: {image: "%s"}\n' "$from" "$from" >"$work/old.yaml"
cleanup() {
  compose down -v --remove-orphans >/dev/null 2>&1 || true
  "$CTR" run --rm -v "$work:/w" --entrypoint sh "$PG_IMAGE" -c 'rm -rf /w/backups' >/dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

# shellcheck disable=SC2016 # expanded in the container
psql_in() { compose exec -T "$1" sh -c "psql -U \"\$POSTGRES_USER\" -d $2 -XAtq -v ON_ERROR_STOP=1"; }
expect() { [[ $2 == "$3" ]] || die "pg-upgrade-test: $1: got '$2', want '$3'"; }
major() { echo $(($(psql_in "$1" postgres <<<'SHOW server_version_num') / 10000)); }

log "pg-upgrade-test: db and zitadel-db on ${from%@*}"
compose up -d --wait db zitadel-db >/dev/null 2>&1 || die "pg-upgrade-test: the old instances did not start"
compose run --rm -T db-init >/dev/null 2>&1 || die "pg-upgrade-test: db-init failed on the old instances"
psql_in db ashyq <<'SQL' >/dev/null
SET client_min_messages = warning;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE rehearsal (id bigint PRIMARY KEY, title text NOT NULL, embedding vector(3));
INSERT INTO rehearsal SELECT g, 'row ' || g, ARRAY[g, g + 1, g + 2]::vector FROM generate_series(1, 5000) g;
CREATE INDEX ON rehearsal USING hnsw (embedding vector_l2_ops);
ALTER TABLE rehearsal OWNER TO ashyq;
SQL
psql_in db rehearsal <<<"CREATE TABLE marker (v text); INSERT INTO marker VALUES ('superuser database');" >/dev/null
psql_in zitadel-db postgres <<<"SELECT 'CREATE DATABASE zitadel' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'zitadel') \\gexec" >/dev/null
psql_in zitadel-db zitadel <<<'CREATE TABLE events (id int); INSERT INTO events SELECT generate_series(1, 300);' >/dev/null
old_major=$(major db)
# shellcheck disable=SC2016 # expanded in the container
compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -XAtqc "SELECT pg_switch_wal()" >/dev/null; sleep 2'

export COMPOSE_FILE=$files
bash infra/scripts/pg-upgrade.sh --pending 2>/dev/null || die "pg-upgrade-test: --pending misses the old clusters"
bash infra/scripts/pg-upgrade.sh
if bash infra/scripts/pg-upgrade.sh --pending 2>/dev/null; then die "pg-upgrade-test: --pending after the upgrade"; fi

new_major=$(major db)
((new_major > old_major)) || die "pg-upgrade-test: db runs $new_major after the upgrade (was $old_major)"
expect 'zitadel-db version' "$(major zitadel-db)" "$new_major"
expect 'app rows' "$(psql_in db ashyq <<<'SELECT count(*), sum(id) FROM rehearsal')" '5000|12502500'
expect 'pgvector' "$(psql_in db ashyq <<<"SELECT embedding <-> '[1,2,3]' FROM rehearsal WHERE id = 2")" '1.7320508075688772'
expect 'owner' "$(psql_in db ashyq <<<"SELECT tableowner FROM pg_tables WHERE tablename = 'rehearsal'")" ashyq
expect 'app role' "$(psql_in db postgres <<<"SELECT rolcanlogin FROM pg_roles WHERE rolname = 'ashyq'")" t
expect 'superuser database' "$(psql_in db rehearsal <<<'SELECT v FROM marker')" 'superuser database'
expect 'zitadel rows' "$(psql_in zitadel-db zitadel <<<'SELECT count(*) FROM events')" 300
expect 'old cluster kept' "$(compose exec -T db sh -c "cat /var/lib/postgresql/$old_major/docker.before-pg$new_major/PG_VERSION")" "$old_major"
[[ -n $(compose exec -T db sh -c "ls /pitr/wal.before-pg$new_major") ]] ||
  die "pg-upgrade-test: the old WAL archive did not move aside"
# The new cluster archives again (wal-archive.sh accepts it).
# shellcheck disable=SC2016 # expanded in the container
compose exec -T db sh -c 'psql -U "$POSTGRES_USER" -d postgres -XAtqc "SELECT pg_switch_wal()" >/dev/null; sleep 3'
expect 'archiving' "$(psql_in db postgres <<<'SELECT archived_count > 0 AND failed_count = 0 FROM pg_stat_archiver')" t
log "pg-upgrade-test ok: $old_major -> $new_major"
