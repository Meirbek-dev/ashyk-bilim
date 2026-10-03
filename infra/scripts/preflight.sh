#!/usr/bin/env bash
# Prod host checks before a deploy. Prints key names and verdicts, never values.
set -euo pipefail
# shellcheck source=infra/scripts/lib.sh
source "$(dirname "$0")/lib.sh"
use_prod

fails=0
fail() { log "FAIL: $*"; fails=$((fails + 1)); }
warn() { log "WARN: $*"; }
# Last value of KEY in an env file, surrounding quotes stripped.
env_get() { sed -n "s/^$1=//p" "${2:-.env}" | tail -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"; }
keys_matching() { grep -E "$1" "$2" | cut -d= -f1 | sort -u | paste -sd' ' - || true; }

for f in .env server.env; do [[ -f $f ]] || die "$f is missing"; done

compose config -q || fail "compose config is invalid"

case "$(uname -s)" in MINGW* | MSYS* | CYGWIN*) windows=1 ;; *) windows=0 ;; esac
for f in .env server.env; do
  k=$(keys_matching '^[A-Za-z_][A-Za-z0-9_]*=.*CHANGE_ME' "$f")
  [[ -z $k ]] || fail "$f: CHANGE_ME placeholder in: $k"
  k=$(keys_matching '^PLATFORM_' "$f")
  [[ -z $k ]] || fail "$f: legacy PLATFORM_* keys present: $k"
  mode=$(stat -c %a "$f")
  if [[ $mode != 600 ]]; then
    if ((windows)); then warn "$f mode is $mode (not enforced on Windows)"; else fail "$f mode is $mode, want 600 (chmod 600 $f)"; fi
  fi
done

k=$(keys_matching '^[A-Za-z_][A-Za-z0-9_]*=[[:space:]]*$' server.env)
[[ -z $k ]] || fail "server.env: empty values: $k"
for key in AB__DATABASE__URL AB__ZITADEL__PAT; do
  [[ -n $(env_get "$key" server.env) ]] || fail "server.env: $key is not set"
done

# The server refuses to start with a Resend key and no sender.
if [[ -n $(env_get AB__RESEND__API_KEY server.env) && -z $(env_get AB__RESEND__FROM server.env) ]]; then
  fail "server.env: AB__RESEND__API_KEY is set without AB__RESEND__FROM"
fi

proj=$(env_get COMPOSE_PROJECT_NAME)
[[ -n $proj ]] || fail ".env: COMPOSE_PROJECT_NAME is not set (prod: openu-prod)"

mk=$(env_get ZITADEL_MASTERKEY)
((${#mk} == 32)) || fail ".env: ZITADEL_MASTERKEY must be exactly 32 characters"

exp=$(env_get ZITADEL_PAT_EXPIRATION)
if [[ -z $exp ]] || ! exp_ts=$(date -d "$exp" +%s 2>/dev/null); then
  fail ".env: ZITADEL_PAT_EXPIRATION is missing or not a date"
else
  days=$(((exp_ts - $(date +%s)) / 86400))
  if ((exp_ts <= $(date +%s))); then
    fail "Zitadel PAT expired; issue a new one (RUNBOOK: PAT rotation)"
  elif ((days < 30)); then
    warn "Zitadel PAT expires in $days days"
  fi
fi

domain=$(env_get NGINX_SERVER_NAME)
if command -v openssl >/dev/null; then
  tls=$(env_get TLS_DIR)
  for cert in "${tls:-certs}/cert.pem" "/etc/letsencrypt/live/$domain/fullchain.pem"; do
    [[ -n $domain && -r $cert ]] || continue
    openssl x509 -checkend $((14 * 86400)) -noout -in "$cert" >/dev/null ||
      warn "TLS certificate $cert expires within 14 days"
    break
  done
fi

if command -v docker >/dev/null && docker info >/dev/null 2>&1; then
  root=$(docker info -f '{{.DockerRootDir}}')
  pct=$(df -P "$root" | awk 'NR == 2 { sub("%", "", $5); print $5 }')
  pct=${pct:-0}
  ((pct < 85)) || warn "disk holding $root is ${pct}% full"

  # A wrong project name would silently start an empty database: once this host
  # has run the stack (containers, any postgres volume, or deploy history),
  # the project's own data volume must exist.
  if [[ -n $proj ]] &&
    { [[ -s .deploy-history ]] ||
      [[ -n $(docker ps -aq --filter "label=com.docker.compose.project=$proj") ]] ||
      grep -q '_postgres_data$' <<<"$(docker volume ls -q)"; } &&
    ! docker volume inspect "${proj}_postgres_data" >/dev/null 2>&1; then
    fail "volume ${proj}_postgres_data is missing on a host that already ran the stack (wrong COMPOSE_PROJECT_NAME?)"
  fi
else
  warn "docker is not reachable; disk and volume checks skipped"
fi

((fails == 0)) || die "preflight: $fails check(s) failed"
log "preflight: ok"
