#!/usr/bin/env bash
# Certbot deploy hook (install: ln -s <checkout>/infra/scripts/renew-certificate.sh
# /etc/letsencrypt/renewal-hooks/deploy/ashyq). Also safe to run by hand.
# Certificate paths come from TLS_CERT_FILE / TLS_KEY_FILE (shell, else ./.env,
# else ./certs/{cert,key}.pem); the lineage must be named after NGINX_SERVER_NAME.
# shellcheck source=infra/scripts/lib.sh
source "$(dirname "$(readlink -f "$0")")/lib.sh"
use_prod

envval() { [[ ! -f .env ]] || sed -n "s/^$1=//p" .env | tail -n 1; }
domain=${NGINX_SERVER_NAME:-$(envval NGINX_SERVER_NAME)}
cert=${TLS_CERT_FILE:-$(envval TLS_CERT_FILE)}
key=${TLS_KEY_FILE:-$(envval TLS_KEY_FILE)}
cert=${cert:-./certs/cert.pem}
key=${key:-./certs/key.pem}

if [[ -n ${RENEWED_LINEAGE:-} ]]; then
  [[ $(basename "$RENEWED_LINEAGE") == "$domain" ]] || exit 0
  # Copy layout (default): overwrite in place. cp keeps the inode, so nginx's
  # single-file bind mounts see the new bytes.
  if [[ $(readlink -f "$cert") != "$(readlink -f "$RENEWED_LINEAGE/fullchain.pem")" ]]; then
    cp "$RENEWED_LINEAGE/fullchain.pem" "$cert"
    cp "$RENEWED_LINEAGE/privkey.pem" "$key"
    chmod 600 "$key"
  fi
fi

if [[ -L $cert ]]; then
  # Mounted through a letsencrypt symlink: the bind mount pinned the old target.
  log "recreating nginx (symlinked certificate)"
  compose up -d --no-deps --force-recreate nginx
else
  compose exec -T nginx nginx -t
  compose exec -T nginx nginx -s reload
fi
log "certificate reloaded"
