#!/usr/bin/env bash
# storage-init job (aws-cli image): buckets, public-read policy on ab-public,
# CORS for STORAGE_CORS_ORIGINS (space/comma separated), smoke probe object.
# Idempotent: every step converges to the same state.
set -euo pipefail

for _ in $(seq 30); do aws s3api list-buckets >/dev/null 2>&1 && break; sleep 1; done

# shellcheck disable=SC2086 # split the list on purpose
origins=$(printf '"%s",' ${STORAGE_CORS_ORIGINS//,/ })
sed "s|__ORIGINS__|[${origins%,}]|" /storage/cors.json.template >/tmp/cors.json

for bucket in ab-public ab-private; do
  aws s3api head-bucket --bucket "$bucket" 2>/dev/null || aws s3api create-bucket --bucket "$bucket"
  aws s3api put-bucket-cors --bucket "$bucket" --cors-configuration file:///tmp/cors.json
done
aws s3api put-bucket-policy --bucket ab-public --policy file:///storage/public-policy.json

# smoke.sh reads it anonymously through nginx: /content/_probe/smoke.txt
printf 'ok\n' >/tmp/probe.txt
aws s3api put-object --bucket ab-public --key _probe/smoke.txt --body /tmp/probe.txt \
  --content-type text/plain >/dev/null

echo "storage-init: buckets, policy, CORS [${origins%,}] ok"
