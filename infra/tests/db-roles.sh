#!/usr/bin/env bash
# Least-privilege roles (infra/postgres/roles.sql, RUNBOOK 2.5) on a throwaway Postgres of the stack's image,
# no network, removed on exit: db-init as compose runs it, every migration as the owner, then what ashyq_app and
# ashyq_ro may and may not do - on a fresh install (default privileges), after a re-run of db-init (an existing
# database), in a database the owner creates later (template1's defaults), and after pgvector moved into the
# extensions schema (infra/postgres/vector-to-extensions.sql, schema review 43). `just ci-infra` runs it.
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
    [[ $2 == denied && $out =~ (permission denied|read-only transaction|must be owner|less than 30 days ago) ]] && return
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
  check ashyq_ro denied "SELECT ip_address FROM auth_audit_log"
  check ashyq_ro denied "SELECT * FROM google_accounts"
  check ashyq_ro denied "SELECT * FROM idempotency_keys"
  check ashyq_ro denied "INSERT INTO jobs (kind) VALUES ('x')"
  check ashyq_ro denied "SELECT prune_auth_audit_log(365, 10)"
  # Read-only is a default the role can turn off: what it may write then is privileges alone.
  ro_rw="SET default_transaction_read_only = off;"
  check ashyq_ro denied "$ro_rw INSERT INTO jobs (kind) VALUES ('x')"
  check ashyq_ro denied "$ro_rw SELECT lo_from_bytea(0, '\\x00')"
  check ashyq_ro denied "$ro_rw CREATE TEMP TABLE ro_scratch (i int)"
  check ashyq_app ok "CREATE TEMP TABLE app_scratch (i int)"
  # The owner runs these expressions as DDL (schema_try_check).
  check ashyq_app denied "DELETE FROM schema_skipped_checks"
  check ashyq_app denied "SELECT analytics_events_drop_partitions(now())"
  # A column named like contact data or a secret is hidden from ashyq_ro, also on a table added later.
  check ashyq ok "DO \$\$ DECLARE leaks text; BEGIN
      SELECT string_agg(c.table_name || '.' || c.column_name, ', ') INTO leaks
      FROM information_schema.columns c
      WHERE c.table_schema IN ('public', 'core', 'learning', 'ai', 'analytics', 'ops')
        AND c.column_name ~ '^(email|ip|ip_address|user_agent|phone|google_sub|password.*|.*_?token|.*_?secret)\$'
        AND has_column_privilege('ashyq_ro', format('%I.%I', c.table_schema, c.table_name), c.column_name, 'SELECT');
      IF leaks IS NOT NULL THEN RAISE EXCEPTION 'ashyq_ro reads %', leaks; END IF;
    END \$\$"
  # Schema review 2026-11-08 (item 45): free text a person wrote stays out, the rest of the row is readable.
  check ashyq_ro ok "SELECT id, status, created_at FROM course_discussions"
  check ashyq_ro denied "SELECT content FROM course_discussions"
  check ashyq_ro denied "SELECT overall_feedback FROM grading_entries"
  check ashyq_ro denied "SELECT memory_text FROM ai_student_memory"
  # Opt-in for whole tables: ashyq_ro reads every column only of the tables reviewed here as holding no one's free
  # text or contact data. A new table (default privileges grant it) fails until it is added here or its columns
  # are hidden in apply_role_grants.
  check ashyq ok "DO \$\$ DECLARE unreviewed text; BEGIN
      SELECT string_agg(c.relname, ', ' ORDER BY c.relname) INTO unreviewed
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname IN ('public', 'core', 'learning', 'ai', 'analytics', 'ops') AND c.relkind IN ('r', 'p')
        AND NOT c.relispartition AND has_table_privilege('ashyq_ro', c.oid, 'SELECT')
        AND c.relname <> ALL (string_to_array('_sqlx_migrations activities activity_kinds activity_progress ai_approvals ai_course_analyses ai_course_settings ai_eval_results ai_events ai_feature_switches ai_lecture_reviews ai_remediation_sessions ai_runs ai_token_ledger ai_token_reservations ai_work_embeddings analytics_events analytics_saved_views assessment_access_usergroups assessment_access_users assessment_audit_events assessment_items assessment_versions assessments block_uploads blocks bulk_actions certifications chapters code_runs collection_courses collection_staff collections completions concept_mastery concept_prerequisites concept_tags content_chunks content_index_state course_concepts course_progress course_staff course_update_activities course_updates courses daily_assessment_metrics daily_course_engagement daily_course_metrics daily_platform_metrics daily_teacher_metrics daily_user_course_progress discussion_reactions enrolment_events enrolments feature_activations file_submissions gamification_completions gamification_config gamification_profiles job_schedules learner_risk_snapshots mastery_evidence notification_kinds notification_opt_outs notifications post_uploads role_permissions roles schema_skipped_checks trail_legacy_marks translatable_fields translations upload_purposes uploads user_roles usergroup_courses usergroup_members usergroups xp_transactions', ' '));
      IF unreviewed IS NOT NULL THEN RAISE EXCEPTION 'ashyq_ro reads every column of unreviewed %', unreviewed; END IF;
    END \$\$"
  # Schema review 43: the tables sit in their schemas, found through the database's search_path.
  check ashyq_app ok "SELECT count(*) FROM core.users, learning.submissions, ops.jobs, ai.ai_runs, analytics.analytics_events"
  check ashyq_app ok "SELECT analytics_events_ensure_partitions(1), analytics_events_drop_partitions(now() - interval '1000 days')"
  check ashyq_app denied "CREATE TABLE core.intruder (id int)"
  check ashyq_ro denied "SELECT email FROM core.users"
  check ashyq ok "SELECT 1 WHERE current_setting('search_path') = 'public, core, learning, ai, analytics, ops, extensions'
                    AND NOT EXISTS (SELECT FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'
                                     AND relname <> '_sqlx_migrations') HAVING count(*) = 1"
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

# Schema review 43 (preparation): db-init's empty extensions schema, then the superuser step that moves pgvector.
for d in ashyq ashyq_later; do
  [[ $(x psql -X -U postgres -d "$d" -Atc "SELECT count(*) FROM pg_namespace WHERE nspname = 'extensions'") == 1 ]] ||
    { log "FAIL: $d has no extensions schema"; failures=$((failures + 1)); }
done
x psql -X -q -U postgres -d ashyq -v ON_ERROR_STOP=1 -f /pg/vector-to-extensions.sql >/dev/null
log "db-roles: pgvector moved to the extensions schema"
[[ $(x psql -X -U postgres -d ashyq -Atc "SELECT extnamespace::regnamespace FROM pg_extension WHERE extname = 'vector'") == extensions ]] ||
  { log "FAIL: vector is not in the extensions schema"; failures=$((failures + 1)); }
check ashyq_app ok "SELECT '[1,2]'::vector <=> '[1,3]'::vector, (SELECT count(embedding <=> embedding) FROM content_chunks)"
check ashyq_ro ok "SELECT count(embedding <=> embedding) FROM content_chunks"
check ashyq ok "CREATE TABLE vector_check (v vector(3)); DROP TABLE vector_check"
probe

# db-init runs the owner's apply_role_grants as the owner: an owner that rewrote it cannot become superuser.
x psql -X -q -U ashyq -d ashyq -v ON_ERROR_STOP=1 -c "CREATE OR REPLACE FUNCTION apply_role_grants(owner name)
  RETURNS void LANGUAGE plpgsql AS \$\$ BEGIN EXECUTE format('ALTER ROLE %I SUPERUSER', owner); END \$\$" >/dev/null
x sh /pg/db-init.sh >/dev/null 2>&1 && { log "FAIL: db-init ran a rewritten apply_role_grants"; failures=$((failures + 1)); }
[[ $(x psql -X -U postgres -d postgres -Atc "SELECT rolsuper FROM pg_roles WHERE rolname = 'ashyq'") == f ]] ||
  { log "FAIL: the owner made itself superuser through db-init"; failures=$((failures + 1)); }

((failures == 0)) || die "db-roles: $failures privilege checks failed"
log "db-roles ok"
