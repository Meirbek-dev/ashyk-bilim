#!/usr/bin/env bash
# Exercise the production backup and restore scripts with synthetic user work, never a production archive.
# `restore-test.sh`: a throwaway stand of the release images (IMAGE_TAG), seed, fixture, backup, restore drill.
# `restore-test.sh down`: remove the stand. Certificate: tmp/smoke/certs (the justfile recipe makes it).
# shellcheck source=infra/scripts/lib.sh
source "$(dirname "$0")/lib.sh"
use_restore
if [[ ${1:-} == down ]]; then
  compose down -v --remove-orphans
  rm -f "$SERVER_ENV_FILE"
  exit 0
fi
mkdir -p tmp/restore-test "$BACKUP_DIR/restic"
STACK=restore bash infra/scripts/bootstrap.sh
compose up -d --wait
compose exec -T -e AB__ENVIRONMENT=development -e E2E_PASSWORD server ashyq admin seed-e2e --learners 2

# The stand's host name and certificate live in its env file (smoke.env), not in the shell.
host=$(envval NGINX_SERVER_NAME) tls_dir=$(envval TLS_DIR)
[[ -n $host && -n $tls_dir ]] || die "NGINX_SERVER_NAME or TLS_DIR is missing from $COMPOSE_ENV_FILES"
edge_ip=$("$CTR" inspect "$(compose ps -q nginx)" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
[[ -n $edge_ip ]] || die "the stand's edge is not running"
root=$(pwd -W 2>/dev/null || pwd)
"$CTR" run --rm --init --network "${COMPOSE_PROJECT_NAME}_edge-net" \
  --add-host "$host:$edge_ip" -v "$root:/repo" -w /repo \
  -e "E2E_PASSWORD=$E2E_PASSWORD" -e NODE_EXTRA_CA_CERTS=/repo/tmp/smoke/certs/cert.pem \
  -e "E2E_BASE_URL=https://$host" \
  "docker.io/library/node:$(tr -d '[:space:]' <.node-version)-alpine" node /repo/infra/tests/restore-fixture.mjs
course_id=$(<tmp/restore-test/course-id)
# A synthetic earned certificate complements the API-created template and graded learner work.
compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -v course_id="$1" -U "$POSTGRES_USER" -d ashyq' sh "$course_id" <<'SQL'
INSERT INTO certificate_users
  (certification_id, user_id, verify_code, course_id, holder_name, course_name, certificate_name)
SELECT cert.id, u.id, 'RESTORE-' || cert.id::text, c.id, u.display_name, c.name,
  coalesce(certification_text(cert.config, 'certification_name'), c.name)
FROM certifications cert JOIN courses c ON c.id = cert.course_id
CROSS JOIN users u
WHERE c.id = :'course_id'::uuid AND u.username = 'e2e-student1';
SELECT EXISTS (SELECT 1 FROM submissions s JOIN assessments a ON a.id = s.assessment_id
  WHERE a.course_id = :'course_id'::uuid AND s.final_score = 100) AS has_grade \gset
\if :has_grade
\else
  \echo synthetic graded learner work is missing
  \quit 1
\endif
SQL
key=$(<tmp/restore-test/object-key)
https_port=${HTTPS_PORT:-443}
curl -fsS --cacert "$tls_dir/cert.pem" --resolve "$host:$https_port:127.0.0.1" \
  "https://$host:$https_port/content/$key" | sha256sum | cut -d' ' -f1 >tmp/restore-test/object.sha256
# Freeze writers before taking the expected manifest and invoking the real backup hooks.
compose stop worker server web >/dev/null
compose exec -T db sh -c 'psql -XAtq -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d ashyq' \
  <infra/tests/restore-manifest.sql >tmp/restore-test/expected.manifest
STACK=restore bash infra/scripts/backup.sh >tmp/restore-test/backup.log 2>&1
export EXPECTED_RESTORE_MANIFEST=$ROOT/tmp/restore-test/expected.manifest
export RESTORE_OBJECT_KEY=$key RESTORE_OBJECT_SHA256
export RESTORE_TEST_PASSWORD=$E2E_PASSWORD
RESTORE_OBJECT_SHA256=$(<tmp/restore-test/object.sha256)
bash infra/scripts/restore-drill.sh latest >tmp/restore-test/drill.log 2>&1
log "restore integrity: user data hashes, identities, grades, certificates and object bytes match"
