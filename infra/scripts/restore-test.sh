#!/usr/bin/env bash
# Exercise the production backup and restore scripts with synthetic user work, never a production archive.
# shellcheck source=infra/scripts/lib.sh
source "$(dirname "$0")/lib.sh"
use_web_e2e
[[ $COMPOSE_PROJECT_NAME == ashyq-web-e2e ]] || die "restore-test requires the isolated ashyq-web-e2e project"
mkdir -p tmp/restore-test tmp/restore-test-archives
bash infra/scripts/web-e2e.sh fixture
# A synthetic earned certificate complements the API-created template and graded learner work.
compose exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d ashyq' <<'SQL'
INSERT INTO certificate_users (certification_id, user_id, verify_code)
SELECT cert.id, u.id, 'RESTORE-FIXTURE'
FROM certifications cert JOIN courses c ON c.id = cert.course_id
CROSS JOIN users u
WHERE c.name = 'Restore integrity fixture' AND u.username = 'e2e-student1';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM submissions s JOIN assessments a ON a.id = s.assessment_id
    JOIN courses c ON c.id = a.course_id WHERE c.name = 'Restore integrity fixture' AND s.final_score = 100)
  THEN RAISE EXCEPTION 'synthetic graded learner work is missing'; END IF;
END $$;
SQL
key=$(<tmp/restore-test/object-key)
curl -fsS --cacert "$TLS_DIR/cert.pem" --resolve "$E2E_WEB_HOST:443:127.0.0.1" \
  "https://$E2E_WEB_HOST/content/$key" | sha256sum | cut -d' ' -f1 >tmp/restore-test/object.sha256
# Freeze writers before taking the expected manifest and invoking the real backup hooks.
compose stop worker server web >/dev/null
compose exec -T db sh -c 'psql -XAtq -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d ashyq' \
  <infra/tests/restore-manifest.sql >tmp/restore-test/expected.manifest
compose exec -T backup backup >tmp/restore-test/backup.log 2>&1
archive=$(find tmp/restore-test-archives -maxdepth 1 -name 'backup-*.tar.zst' | sort | tail -n 1)
[[ -n $archive ]] || die "backup produced no archive"
export EXPECTED_RESTORE_MANIFEST=$ROOT/tmp/restore-test/expected.manifest
export RESTORE_OBJECT_KEY=$key RESTORE_OBJECT_SHA256
export RESTORE_TEST_PASSWORD=$E2E_PASSWORD
RESTORE_OBJECT_SHA256=$(<tmp/restore-test/object.sha256)
bash infra/scripts/restore-drill.sh "$archive" >tmp/restore-test/drill.log 2>&1
log "restore integrity: user data hashes, identities, grades, certificates and object bytes match"
