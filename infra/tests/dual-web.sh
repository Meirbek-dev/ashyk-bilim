#!/usr/bin/env bash
# Dual web (docs/INFRA.md "Dual web"): which web the edge sends each page to, with `dual-web` in COMPOSE_PROFILES and
# without, against stub webs (infra/compose.dual-check.yaml). Needs a container runtime and the smoke cert.
# shellcheck source=infra/scripts/lib.sh
source "$(dirname "$0")/../scripts/lib.sh"
use_smoke
export COMPOSE_PROJECT_NAME=ashyq-dual-$$ IMAGE_TAG=ci
export COMPOSE_FILE=$COMPOSE_FILE:infra/compose.dual-check.yaml
trap 'compose down -v >/dev/null 2>&1' EXIT

fails=0
# expect <web> <path> [cookie]: the body names the web that answered.
expect() {
  local body
  body=$(compose exec -T nginx curl -s -H 'Host: ashyq.test' ${3:+-b "$3"} "http://127.0.0.1$2")
  if [[ $body == "$1 "* ]]; then return; fi
  log "FAIL $2 ${3:-(no cookie)}: want $1, got '${body:0:60}'"
  fails=$((fails + 1))
}

# up <COMPOSE_PROFILES> <service>...: (re)create them; nginx renders its config from the profiles.
up() {
  COMPOSE_PROFILES=$1 compose up -d --no-deps --force-recreate "${@:2}" >/dev/null
  # Ready when every started web answers through the edge (/home is web2's while dual web is on).
  local probe=/
  [[ $1 == dual-web ]] && probe='/home'
  for _ in $(seq 30); do
    compose exec -T nginx curl -fs -o /dev/null -H 'Host: ashyq.test' http://127.0.0.1/ 2>/dev/null &&
      compose exec -T nginx curl -fs -o /dev/null -H 'Host: ashyq.test' "http://127.0.0.1$probe" 2>/dev/null && return
    sleep 1
  done
  compose ps -a >&2
  compose logs --tail 30 "${@:2}" >&2
  compose exec -T nginx curl -s -H 'Host: ashyq.test' "http://127.0.0.1$probe" >&2 || true
  die "edge did not answer"
}

up dual-web nginx web web2
# Paths only one web has, whatever the cookie says.
for cookie in '' 'ab_ui=v2'; do
  expect classic /_next/static/x.js "$cookie"
  expect classic /api/health "$cookie"
  expect classic /app_logo.svg "$cookie"
  expect new /home "$cookie"
  expect new /learn/c/a "$cookie"
  expect new /teach/courses "$cookie"
  expect new /login "$cookie"
  expect new /assets/index-1.js "$cookie"
  expect new /courses/0199 "$cookie"
done
# Shared paths follow the cookie; the old web is the default.
for path in / /courses /collections /search /ru/course/x /certificates/X/verify; do
  expect classic "$path"
  expect classic "$path" 'ab_ui=classic'
  expect new "$path" 'ab_ui=v2'
done

# The switch: a cookie and a relative redirect home; every web response offers it while on.
headers=$(compose exec -T nginx curl -s -o /dev/null -D - -H 'Host: ashyq.test' http://127.0.0.1/ui/new)
grep -qi '^set-cookie: ab_ui=v2;' <<<"$headers" || { log "FAIL /ui/new sets no ab_ui=v2"; fails=$((fails + 1)); }
grep -qi '^location: /\s*$' <<<"$headers" || { log "FAIL /ui/new does not redirect to /"; fails=$((fails + 1)); }
headers=$(compose exec -T nginx curl -s -o /dev/null -D - -H 'Host: ashyq.test' http://127.0.0.1/ui/classic)
grep -qi '^set-cookie: ab_ui=;.*max-age=0' <<<"$headers" || { log "FAIL /ui/classic keeps ab_ui"; fails=$((fails + 1)); }
headers=$(compose exec -T nginx curl -s -o /dev/null -D - -H 'Host: ashyq.test' http://127.0.0.1/courses)
grep -qi '^set-cookie: ab_dual=1;' <<<"$headers" || { log "FAIL no ab_dual on a page"; fails=$((fails + 1)); }
grep -qi '^x-content-type-options: nosniff' <<<"$headers" || { log "FAIL page lost the baseline headers"; fails=$((fails + 1)); }

# Off: one web, the cookie means nothing, no switch offered.
up '' nginx web
for path in / /home /courses/0199 /assets/index-1.js; do
  expect classic "$path" 'ab_ui=v2'
done
headers=$(compose exec -T nginx curl -s -o /dev/null -D - -H 'Host: ashyq.test' http://127.0.0.1/courses)
if grep -qi '^set-cookie: ab_dual' <<<"$headers"; then log "FAIL ab_dual sent while off"; fails=$((fails + 1)); fi

((fails == 0)) || die "dual web: $fails check(s) failed"
log "dual web routing ok"
