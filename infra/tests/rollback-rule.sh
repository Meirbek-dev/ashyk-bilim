#!/usr/bin/env bash
# A rollback skips the "migrations differ" refusal only across expand-only migrations (migrations.sh).
set -euo pipefail
# shellcheck source=infra/scripts/migrations.sh
source "$(dirname "$0")/../scripts/migrations.sh"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$work"
git init -q
git config user.email t@example.com
git config user.name t
mkdir -p "$MIGRATIONS"
commit() { git add -A && git commit -qm "$1" && git rev-parse --short HEAD; }
fail() { echo "rollback-rule: $1" >&2; exit 1; }

echo 'SELECT 1;' >"$MIGRATIONS/20261101000000_old.sql"
base=$(commit base)
echo 'SELECT 2;' >"$MIGRATIONS/20261103000000_add_table.sql"
expand=$(commit expand)
printf -- '-- contract: x\nSELECT 3;\n' >"$MIGRATIONS/20261104000000_drop.sql"
contract=$(commit contract)
git reset -q --hard "$base"
echo 'SELECT 4;' >"$MIGRATIONS/20261001000000_before_rule.sql"
old_rule=$(commit before-rule)
git reset -q --hard "$base"
echo 'SELECT 9;' >"$MIGRATIONS/20261101000000_old.sql"
edited=$(commit edited)

expand_only "$base" "$base" || fail "same migrations must pass"
expand_only "$base" "$expand" || fail "an added expand file must pass"
! expand_only "$base" "$contract" || fail "a contract file must refuse"
! expand_only "$expand" "$base" || fail "a newer target (removed files) must refuse"
! expand_only "$base" "$old_rule" || fail "a file older than the expand/contract rule must refuse"
! expand_only "$base" "$edited" || fail "an edited migration must refuse"
! expand_only "" "$expand" || fail "an unknown release must refuse"
! expand_only "$base" deadbeef || fail "an unknown sha must refuse"
echo "rollback-rule ok"
