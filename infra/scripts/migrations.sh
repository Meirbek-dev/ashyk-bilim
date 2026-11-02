# shellcheck shell=bash
# Which releases share a schema, for deploy.sh and rollback.sh (sourced; run from the repository root).
MIGRATIONS=apps/server/migrations
# migration_rules.rs holds every migration from this version on to expand/contract.
EXPAND_CONTRACT_FROM=20261102000000

# False (= "migrations changed") also when either sha is empty or unknown to git.
same_migrations() { [[ -n $1 && -n $2 ]] && git diff --quiet "$1" "$2" -- "$MIGRATIONS" 2>/dev/null; }

# expand_only <older> <newer>: <newer> only adds migrations to <older>, each held to expand/contract and none
# a `-- contract:` file, so the <older> binary runs on the schema <newer> migrated (migration_rules.rs).
expand_only() {
  local older=$1 newer=$2 changes status file version
  [[ -n $older && -n $newer ]] || return 1
  changes=$(git diff --name-status --no-renames "$older" "$newer" -- "$MIGRATIONS" 2>/dev/null) || return 1
  [[ -n $changes ]] || return 0
  while read -r status file; do
    [[ $status == A ]] || return 1
    version=${file##*/}
    version=${version%%_*}
    [[ $version =~ ^[0-9]+$ ]] && ((version >= EXPAND_CONTRACT_FROM)) || return 1
    if git show "$newer:$file" | grep -q -- '-- contract:'; then return 1; fi
  done <<<"$changes"
}
