#!/usr/bin/env bash
# Read-only report of the prod host for planning the stage-1 cutover.
# Run from the repo checkout on the host and paste the output back.
# Prints env key NAMES only, never values. Changes nothing.
set -uo pipefail
cd "$(dirname "$0")/../.." || exit 1

section() { printf '\n===== %s\n' "$*"; }
try() { "$@" 2>&1 || echo "(failed: $*)"; }

section "os"
try uname -a
grep -E '^PRETTY_NAME=' /etc/os-release 2>/dev/null
try uptime

section "tools"
for t in docker git just bun certbot; do
  printf '%-8s %s\n' "$t" "$(command -v "$t" >/dev/null && "$t" --version 2>&1 | head -n 1 || echo 'not installed')"
done
try docker compose version

section "disk"
try df -h / "$(docker info -f '{{.DockerRootDir}}' 2>/dev/null || echo /var/lib/docker)"

section "compose projects and containers"
try docker compose ls -a
try docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}'

section "volumes"
try docker volume ls

section "images (ashyq/openu)"
docker images --format '{{.Repository}}:{{.Tag}}\t{{.CreatedSince}}\t{{.Size}}' 2>/dev/null | grep -E 'ashyq|openu' || echo "(none)"

section "repo"
try git log -1 --format='%h %ci %s'
try git status --short
ls -la .env* server.env .deploy-history 2>/dev/null

section ".env key names (values not shown)"
if [[ -r .env ]]; then
  grep -oE '^[A-Za-z_][A-Za-z0-9_]*=' .env | tr -d '=' | sort | paste -sd' ' - | fold -s -w 100
  pw=$(sed -n 's/^POSTGRES_PASSWORD=//p' .env | tail -n 1 | tr -d "\"'")
  echo "POSTGRES_PASSWORD equals 'openu': $([[ $pw == openu ]] && echo yes || echo no)"
  unset pw
else
  echo "(no readable .env)"
fi

section "cron and timers (certbot/backup)"
crontab -l 2>/dev/null | grep -iE 'certbot|backup|renew' || echo "(user crontab: no matches)"
grep -rilE 'certbot|backup' /etc/cron* 2>/dev/null || echo "(/etc/cron*: no matches)"
systemctl list-timers --all 2>/dev/null | grep -iE 'certbot|backup' || echo "(systemd timers: no matches)"

section "certbot certificates"
if command -v certbot >/dev/null; then
  sudo -n certbot certificates 2>&1 || certbot certificates 2>&1 || echo "(needs root: sudo certbot certificates)"
else
  echo "(certbot not installed)"
fi
ls -la /etc/letsencrypt/renewal-hooks/deploy 2>/dev/null

section "certs/"
ls -la certs/ 2>&1

section "nginx: proxy in front? (client addresses in the last 500 log lines)"
nginx=$(docker ps --filter label=com.docker.compose.service=nginx --format '{{.Names}}' 2>/dev/null | head -n 1)
if [[ -n $nginx ]]; then
  logs=$(docker logs --tail 500 "$nginx" 2>&1)
  echo "container: $nginx"
  echo "lines mentioning X-Forwarded-Proto: $(grep -ci 'x-forwarded-proto' <<<"$logs")"
  # Public client addresses are counted, not listed (they are users).
  awk '$1 ~ /^[0-9a-f.:]+$/ { print $1 }' <<<"$logs" | awk '
    /^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.|127\.|fc|fd|::1)/ { priv[$1]++; np++; next }
    { pub++ }
    END {
      printf "public client lines: %d, private: %d\n", pub, np
      for (a in priv) printf "  private %s x%d\n", a, priv[a]
      print "(mostly one private address => a proxy/NAT in front of nginx)"
    }'
  try docker exec "$nginx" nginx -v
else
  echo "(no running compose nginx container)"
fi
