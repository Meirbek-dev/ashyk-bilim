#!/usr/bin/env bash
# rollback.sh [--force] [sha]: switch back to a previous release (default: the
# previous .deploy-history entry). Refuses when migrations differ unless --force, except across
# expand-only migrations (migrations.sh), which the older binary runs on.
set -euo pipefail
exec "$(dirname "$0")/deploy.sh" --rollback "$@"
