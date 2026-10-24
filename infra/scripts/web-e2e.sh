#!/usr/bin/env bash
# shellcheck source=infra/scripts/lib.sh
source "$(dirname "$0")/lib.sh"
use_web_e2e
case "${1:?up|seed|test|down}" in
  up)
    mkdir -p "$TLS_DIR" "$BACKUP_DIR" tmp/smoke/acme
    if ! { openssl x509 -in "$TLS_DIR/cert.pem" -noout -checkend 86400 &&
      openssl x509 -in "$TLS_DIR/cert.pem" -noout -checkhost "$E2E_WEB_HOST"; } >/dev/null 2>&1; then
      openssl req -x509 -newkey rsa:2048 -nodes -days 2 -subj "/CN=$E2E_WEB_HOST" \
        -addext "subjectAltName=DNS:$E2E_WEB_HOST" -addext basicConstraints=critical,CA:FALSE \
        -addext extendedKeyUsage=serverAuth -keyout "$TLS_DIR/key.pem" -out "$TLS_DIR/cert.pem" 2>/dev/null
    fi
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
    edge_ip=$("$CTR" inspect "$(compose ps -q nginx)" --format '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}')
    [[ -n $edge_ip ]] || die "the isolated edge is not running"
    if [[ $action == fixture ]]; then
      runtime="docker.io/library/node:$(tr -d '[:space:]' <.node-version)-alpine"
      command=(node /repo/infra/tests/restore-fixture.mjs)
    else
      pw=$(cd apps/web && node -p 'require("@playwright/test/package.json").version')
      runtime="mcr.microsoft.com/playwright:v$pw-noble"
      command=(node node_modules/@playwright/test/cli.js test "$@")
    fi
    "$CTR" run --rm --init --network "${COMPOSE_PROJECT_NAME}_edge-net" --ipc host \
      --add-host "$E2E_WEB_HOST:$edge_ip" \
      -v "$root:/repo" -w /repo/apps/web \
      -e CI=1 -e E2E_INSECURE=1 -e "E2E_PASSWORD=$E2E_PASSWORD" -e NODE_EXTRA_CA_CERTS=/repo/tmp/web-e2e/certs/cert.pem \
      -e "E2E_BASE_URL=https://$E2E_WEB_HOST" -e "E2E_API_URL=https://$E2E_WEB_HOST/api/v2" \
      -e E2E_ADMIN_EMAIL=admin@e2e.test -e E2E_TEACHER_EMAIL=teacher@e2e.test -e E2E_STUDENT_EMAIL=student1@e2e.test \
      -e "E2E_ADMIN_PASSWORD=$E2E_PASSWORD" -e "E2E_TEACHER_PASSWORD=$E2E_PASSWORD" -e "E2E_STUDENT_PASSWORD=$E2E_PASSWORD" \
      "$runtime" "${command[@]}"
    ;;
  down)
    compose down -v --remove-orphans
    rm -f "$SERVER_ENV_FILE"
    ;;
  *) die "use up, seed, test or down" ;;
esac
