#!/usr/bin/env bash
# One-off host migration to the two-file env layout (docs/MODERNIZATION-STAGE-1.md 5.4):
#   AB__*, OTEL_* -> server.env        (mode 600; the server reads both)
#   PLATFORM_* -> .env.legacy-removed  (mode 600)
#   the rest stays in .env, plus COMPOSE_PROJECT_NAME=openu-prod if absent.
# The original is kept as .env.pre-split. Usage: split-env.sh [--dry-run] [path/to/.env]
set -euo pipefail

dry=0
if [[ ${1:-} == --dry-run ]]; then dry=1 && shift; fi
src=${1:-$(dirname "$0")/../../.env}
[[ -f $src ]] || { echo "split-env: $src not found" >&2; exit 1; }
dir=$(dirname "$src")
server=$dir/server.env legacy=$dir/.env.legacy-removed backup=$dir/.env.pre-split

names() { grep -E "$1" "$src" | cut -d= -f1 | paste -sd' ' - || true; }
ab=$(names '^(AB__|OTEL_)')
platform=$(names '^PLATFORM_')
grep -q '^COMPOSE_PROJECT_NAME=' "$src" && add_project=0 || add_project=1

echo "-> server.env:           ${ab:-(nothing)}"
echo "-> .env.legacy-removed:  ${platform:-(nothing)}"
((add_project)) && echo "-> .env: add COMPOSE_PROJECT_NAME=openu-prod"
((dry)) && exit 0
if [[ -z $ab$platform ]] && ((!add_project)); then echo "split-env: nothing to do"; exit 0; fi

if [[ -n $ab && -e $server ]]; then
  echo "split-env: $server already exists; merge by hand" >&2
  exit 1
fi

umask 077
[[ -e $backup ]] || cp -p "$src" "$backup" # never overwrite the first original
chmod 600 "$backup"
[[ -z $ab ]] || grep -E '^(AB__|OTEL_)' "$src" >"$server"
# The legacy compose file supplied this default; the server needs it with a Resend key.
if [[ -e $server ]] && grep -q '^AB__RESEND__API_KEY=.' "$server" && ! grep -q '^AB__RESEND__FROM=' "$server"; then
  domain=$(sed -n 's/^NGINX_SERVER_NAME=//p' "$src" | tail -n 1)
  echo "AB__RESEND__FROM=Ashyq Bilim <noreply@$domain>" >>"$server"
fi
[[ -z $platform ]] || grep -E '^PLATFORM_' "$src" >>"$legacy"
grep -vE '^(AB__|OTEL_|PLATFORM_)' "$src" >"$src.tmp" || true
if ((add_project)); then
  [[ -z $(tail -c 1 "$src.tmp") ]] || echo >>"$src.tmp"
  echo 'COMPOSE_PROJECT_NAME=openu-prod' >>"$src.tmp"
fi
mv "$src.tmp" "$src"
for f in "$src" "$server" "$legacy"; do [[ ! -e $f ]] || chmod 600 "$f"; done
echo "split-env: done (original kept as $backup)"
