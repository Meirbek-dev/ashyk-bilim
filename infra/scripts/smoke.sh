#!/usr/bin/env bash
# Black-box checks through the edge, shared by deploy, rollback, CI and drills:
#   smoke.sh <origin>        e.g. smoke.sh https://cs-mooc.tou.edu.kz | http://ashyq.test
# SMOKE_RESOLVE_IP  connect to this IP instead of DNS (curl --resolve), e.g. 127.0.0.1
# SMOKE_INSECURE=1  accept a self-signed certificate
# The Judge0 token check runs only when judge0-server is up in the STACK (default prod).
# Not covered: presigned PUT/GET (needs a verified, logged-in account; the session
# cookie is Secure, so it would not survive the plain-http smoke stack either).
# shellcheck source=infra/scripts/lib.sh
source "$(dirname "$0")/lib.sh"

origin=${1:?usage: smoke.sh <origin>}
origin=${origin%/}
hostport=${origin#*://}
host=${hostport%%:*}
port=${hostport##*:}
[[ $port != "$host" ]] || { [[ $origin == https://* ]] && port=443 || port=80; }

# Status on the last line; no -o /dev/null (Windows curl under Git Bash cannot open it).
curl_opts=(-sS -w '\n%{http_code}' --max-time 15)
[[ -z ${SMOKE_RESOLVE_IP:-} ]] || curl_opts+=(--resolve "$host:$port:$SMOKE_RESOLVE_IP")
[[ -z ${SMOKE_INSECURE:-} ]] || curl_opts+=(-k)

failed=0
# expect <status> <path> [curl args...]: retries for ~30 s (fresh containers).
expect() {
  local want=$1 path=$2 got
  shift 2
  for _ in $(seq 10); do
    got=$(curl "${curl_opts[@]}" "$@" "$origin$path" 2>/dev/null | tail -n 1 || true)
    [[ $got == "$want" ]] && break
    sleep 3
  done
  if [[ $got == "$want" ]]; then
    log "ok   $want $path"
  else
    log "FAIL $path: expected $want, got ${got:-no response}"
    failed=1
  fi
}

expect 200 /api/v2/health/ready
expect 200 / -L --max-redirs 3
expect 200 /content/_probe/smoke.txt

# The TLS proxy in front of prod reads response headers into a 4k buffer and
# answers 502 beyond it; smoke bypasses that proxy, so check the size here.
final=$(curl "${curl_opts[@]}" -L --max-redirs 3 -w '
%{url_effective}' "$origin/" 2>/dev/null | tail -n 1 || true)
size=$(curl "${curl_opts[@]}" -w '
%{size_header}' "${final:-$origin/}" 2>/dev/null | tail -n 1 || true)
if [[ $size =~ ^[0-9]+$ ]] && ((size < 3500)); then
  log "ok   response headers of ${final#"$origin"}: $size bytes"
else
  log "FAIL response headers of ${final#"$origin"}: ${size:-?} bytes (limit 3500; the proxy's buffer is 4k)"
  failed=1
fi

use_stack
if grep -qx judge0-server <<<"$(compose ps --status running --services 2>/dev/null)"; then
  got=$(compose exec -T server curl -sS -o /dev/null -w '%{http_code}' http://judge0-server:2358/languages || true)
  if [[ $got == 401 ]]; then log "ok   401 judge0 without token"; else
    log "FAIL judge0 without token: expected 401, got ${got:-no response}"
    failed=1
  fi
fi

((failed == 0)) || die "smoke failed for $origin"
log "smoke passed for $origin"
