#!/usr/bin/env bash
# shellcheck source=infra/scripts/lib.sh
source "$(dirname "$0")/lib.sh"
use_web_e2e
case "${1:?up|seed|test|down}" in
  up)
    mkdir -p "$TLS_DIR" tmp/web-e2e
    openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj "/CN=$E2E_WEB_HOST" \
      -addext "subjectAltName=DNS:$E2E_WEB_HOST" -addext basicConstraints=critical,CA:FALSE \
      -addext extendedKeyUsage=serverAuth -keyout "$TLS_DIR/key.pem" -out "$TLS_DIR/cert.pem" 2>/dev/null
    STACK=web-e2e bash infra/scripts/bootstrap.sh
    compose up -d --wait
    ;;
  seed)
    compose exec -T -e AB__ENVIRONMENT=development -e E2E_PASSWORD server ashyq admin seed-e2e --learners 2
    ;;
  test|fixture)
    action=$1
    shift
    root=$(pwd -W 2>/dev/null || pwd)
    pw=$(node -p 'require("@playwright/test/package.json").version')
    command=(node ../../node_modules/@playwright/test/cli.js test "$@")
    if [[ $action == fixture ]]; then command=(node /repo/infra/tests/restore-fixture.mjs); fi
    "$CTR" run --rm --init --network "${COMPOSE_PROJECT_NAME}_edge-net" --ipc host \
      -v "$root:/repo" -w /repo/apps/web \
      -e CI=1 -e E2E_INSECURE=1 -e "E2E_PASSWORD=$E2E_PASSWORD" -e NODE_EXTRA_CA_CERTS=/repo/tmp/web-e2e/certs/cert.pem \
      -e "E2E_BASE_URL=https://$E2E_WEB_HOST" -e "E2E_API_URL=https://$E2E_WEB_HOST/api/v2" \
      -e E2E_ADMIN_EMAIL=admin@e2e.test -e E2E_TEACHER_EMAIL=teacher@e2e.test -e E2E_STUDENT_EMAIL=student1@e2e.test \
      -e "E2E_ADMIN_PASSWORD=$E2E_PASSWORD" -e "E2E_TEACHER_PASSWORD=$E2E_PASSWORD" -e "E2E_STUDENT_PASSWORD=$E2E_PASSWORD" \
      "mcr.microsoft.com/playwright:v$pw-noble" "${command[@]}"
    ;;
  down) compose down -v --remove-orphans ;;
  *) die "use up, seed, test or down" ;;
esac
