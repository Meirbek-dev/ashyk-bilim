#!/usr/bin/env bash
# Least-privilege roles (infra/postgres/roles.sql, RUNBOOK 2.5) on a throwaway Postgres of the stack's image,
# no network, removed on exit: db-init as compose runs it, every migration as the owner, then what ashyq_app and
# ashyq_ro may and may not do - on a fresh install (default privileges), after a re-run of db-init (an existing
# database), and in a database the owner creates later (template1's defaults). `just ci-infra` runs it.
source "$(dirname "$0")/../scripts/lib.sh"
[[ -n $CTR ]] || die "db-roles: no container runtime"

name=ashyq-roles-check-$$
root=$(pwd -W 2>/dev/null || pwd)
"$CTR" run -d --rm --name "$name" --network none \
  -v "$root/infra/postgres:/pg:ro" -v "$root/apps/server/migrations:/migrations:ro" \
  -e POSTGRES_PASSWORD=check -e PGUSER=postgres -e ASHYQ_DB_PASSWORD=owner -e ZITADEL_DB_PASSWORD=zitadel \
  -e ASHYQ_DATABASES=ashyq -e ASHYQ_DB_CREATEDB=true -e ASHYQ_APP_DB_PASSWORD=app -e ASHYQ_RO_DB_PASSWORD=ro \
  "$PG_IMAGE" postgres -c shared_preload_libraries=pg_stat_statements >/dev/null
trap '"$CTR" rm -f "$name" >/dev/null 2>&1' EXIT
for _ in $(seq 60); do
  "$CTR" exec "$name" pg_isready -q -h 127.0.0.1 && break
  sleep 1
done

x() { "$CTR" exec -i "$name" "$@"; }
failures=0
check() { # check <role> <ok|denied> <sql>
  local out
  if out=$(x psql -X -q -U "$1" -d "${DB:-ashyq}" -v ON_ERROR_STOP=1 -c "$3" 2>&1); then
    [[ $2 == ok ]] && return
    log "FAIL: $1 may run: $3"
  else
    [[ $2 == denied && $out =~ (permission denied|read-only transaction|must be owner) ]] && return
    log "FAIL: $1 $( [[ $2 == ok ]] && echo 'may not run' || echo 'failed otherwise on'): $3: $out"
  fi
  failures=$((failures + 1))
}

probe() {
  check ashyq_app ok "INSERT INTO users (zitadel_user_id, username, email) VALUES ('z-check', 'check', 'c@x.test')"
  check ashyq_app ok "UPDATE users SET bio = 'b' WHERE username = 'check'"
  check ashyq_app ok "DELETE FROM users WHERE username = 'check'"
  check ashyq_app ok "INSERT INTO auth_audit_log (event) VALUES ('check')"
  check ashyq_app ok "SELECT prune_auth_audit_log(365, 10)"
  check ashyq_app ok "SELECT count(*) FROM _sqlx_migrations"
  check ashyq_app denied "UPDATE auth_audit_log SET event = 'x'"
  check ashyq_app denied "DELETE FROM auth_audit_log"
  check ashyq_app denied "UPDATE grading_entries SET published_at = now()"
  check ashyq_app denied "DELETE FROM file_grading_entries"
  check ashyq_app denied "DELETE FROM assessment_audit_events"
  check ashyq_app denied "DELETE FROM _sqlx_migrations"
  check ashyq_app denied "TRUNCATE jobs"
  check ashyq_app denied "CREATE TABLE intruder (id int)"
  check ashyq_app denied "ALTER TABLE users ADD COLUMN intruder int"
  check ashyq_app denied "DROP TABLE jobs"
  check ashyq_ro ok "SELECT username, display_name FROM users"
  check ashyq_ro ok "SELECT event, created_at FROM auth_audit_log"
  check ashyq_ro denied "SELECT email FROM users"
  check ashyq_ro denied "SELECT ip FROM auth_audit_log"
  check ashyq_ro denied "SELECT * FROM google_accounts"
  check ashyq_ro denied "SELECT * FROM idempotency_keys"
  check ashyq_ro denied "INSERT INTO jobs (kind) VALUES ('x')"
  check ashyq_ro denied "SELECT prune_auth_audit_log(365, 10)"
}

# Every migration as the owner, each in one transaction unless `-- no-transaction` (as sqlx runs them).
migrate() { # migrate <db> [file glob]
  x sh -c "psql -X -q -U ashyq -d $1 -v ON_ERROR_STOP=1 -c 'CREATE TABLE IF NOT EXISTS _sqlx_migrations (
             version bigint PRIMARY KEY, description text NOT NULL, installed_on timestamptz NOT NULL DEFAULT now(),
             success boolean NOT NULL, checksum bytea NOT NULL, execution_time bigint NOT NULL)' &&
           for f in /migrations/${2:-*}.sql; do
             if head -n 1 \"\$f\" | grep -q '^-- no-transaction'; then one=; else one=-1; fi
             psql -X -q -U ashyq -d $1 -v ON_ERROR_STOP=1 \$one -f \"\$f\" >/dev/null || { echo \"\$f\"; exit 1; }
           done"
}

x sh /pg/db-init.sh >/dev/null
migrate ashyq || die "db-roles: migrations failed"
log "db-roles: fresh install (grants from default privileges)"
probe
x sh /pg/db-init.sh >/dev/null
log "db-roles: db-init re-run on the migrated database"
probe
x psql -X -q -U ashyq -d postgres -c 'CREATE DATABASE ashyq_later'
migrate ashyq_later
log "db-roles: a database created after db-init (template1's defaults)"
DB=ashyq_later probe

((failures == 0)) || die "db-roles: $failures privilege checks failed"
log "db-roles ok"
