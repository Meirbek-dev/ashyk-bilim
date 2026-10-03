#!/usr/bin/env bash
# Certbot deploy hook (install: ln -s <checkout>/infra/scripts/renew-certificate.sh
# /etc/letsencrypt/renewal-hooks/deploy/ashyq). Also safe to run by hand.
# Copies the renewed lineage into TLS_DIR (shell, else ./.env, else ./certs) as
# cert.pem/key.pem and reloads nginx; the lineage must be named after NGINX_SERVER_NAME.
# shellcheck source=infra/scripts/lib.sh
source "$(dirname "$(readlink -f "$0")")/lib.sh"
use_prod

envval() { [[ ! -f .env ]] || sed -n "s/^$1=//p" .env | tail -n 1; }
domain=${NGINX_SERVER_NAME:-$(envval NGINX_SERVER_NAME)}
dir=${TLS_DIR:-$(envval TLS_DIR)}
dir=${dir:-./certs}

if [[ -n ${RENEWED_LINEAGE:-} ]]; then
  [[ $(basename "$RENEWED_LINEAGE") == "$domain" ]] || exit 0
  install -m 644 "$RENEWED_LINEAGE/fullchain.pem" "$dir/cert.pem"
  install -m 600 "$RENEWED_LINEAGE/privkey.pem" "$dir/key.pem"
fi

# Directory bind mount: new inodes are visible, a reload picks them up.
compose exec -T nginx nginx -t
compose exec -T nginx nginx -s reload
log "certificate reloaded"
