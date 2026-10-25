#!/usr/bin/env bash
# Exercise the production backup and restore scripts with synthetic user work, never a production archive.
# shellcheck source=infra/scripts/lib.sh
source "$(dirname "$0")/lib.sh"
use_web_e2e
[[ $COMPOSE_PROJECT_NAME == ashyq-web-e2e ]] || die "restore-test requires the isolated ashyq-web-e2e project"
mkdir -p tmp/restore-test tmp/restore-test-archives
bash infra/scripts/web-e2e.sh fixture
course_id=$(<tmp/restore-test/course-id)
# A synthetic earned certificate complements the API-created template and graded learner work.
compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -v course_id="$1" -U "$POSTGRES_USER" -d ashyq' sh "$course_id" <<'SQL'
INSERT INTO certificate_users (certification_id, user_id, verify_code)
SELECT cert.id, u.id, 'RESTORE-' || cert.id::text
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
curl -fsS --cacert "$TLS_DIR/cert.pem" --resolve "$E2E_WEB_HOST:$https_port:127.0.0.1" \
  "https://$E2E_WEB_HOST:$https_port/content/$key" | sha256sum | cut -d' ' -f1 >tmp/restore-test/object.sha256
# Freeze writers before taking the expected manifest and invoking the real backup hooks.
compose stop worker server web >/dev/null
compose exec -T db sh -c 'psql -XAtq -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d ashyq' \
  <infra/tests/restore-manifest.sql >tmp/restore-test/expected.manifest
STACK=web-e2e bash infra/scripts/backup.sh >tmp/restore-test/backup.log 2>&1
export EXPECTED_RESTORE_MANIFEST=$ROOT/tmp/restore-test/expected.manifest
export RESTORE_OBJECT_KEY=$key RESTORE_OBJECT_SHA256
export RESTORE_TEST_PASSWORD=$E2E_PASSWORD
RESTORE_OBJECT_SHA256=$(<tmp/restore-test/object.sha256)
bash infra/scripts/restore-drill.sh latest >tmp/restore-test/drill.log 2>&1
log "restore integrity: user data hashes, identities, grades, certificates and object bytes match"
