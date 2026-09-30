#!/usr/bin/env bash
set -euo pipefail

# Certbot deploy hook, invoked by the host's existing certbot.timer.
[[ "${RENEWED_LINEAGE:-}" == /etc/letsencrypt/live/cs-mooc.tou.edu.kz ]] || exit 0
install -m 644 "$RENEWED_LINEAGE/fullchain.pem" /home/user/openu-prod/certs/cert.pem
install -m 600 "$RENEWED_LINEAGE/privkey.pem" /home/user/openu-prod/certs/key.pem
docker exec openu-prod-nginx-1 nginx -t
docker exec openu-prod-nginx-1 nginx -s reload
