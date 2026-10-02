#!/usr/bin/env bash
# rollback.sh [--force] [sha]: switch back to a previous release (default: the
# previous .deploy-history entry). Refuses when migrations differ unless --force.
set -euo pipefail
exec "$(dirname "$0")/deploy.sh" --rollback "$@"
