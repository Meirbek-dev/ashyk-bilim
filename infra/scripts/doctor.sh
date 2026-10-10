#!/usr/bin/env bash
# Run through `just doctor`: inherits the same shell/PATH as application recipes.
set -euo pipefail
cd "$(dirname "$0")/../.."
source apps/server/tools.env
just_bin=${1:?just executable is required}
for tool in git bash sh bun node cargo rustup; do
  command -v "$tool" >/dev/null || { echo "doctor: missing $tool in the recipe shell" >&2; exit 1; }
done
for tool in "$JUST_TOOL" ${LINT_TOOLS//,/ } ${TEST_TOOLS//,/ } ${DEV_TOOLS//,/ }; do
  name=${tool%@*}
  version=${tool#*@}
  case "$name" in
    just) actual=$("$just_bin" --version) ;;
    sqlx-cli) actual=$(sqlx --version) ;;
    cargo-*) actual=$(cargo "${name#cargo-}" --version) ;;
    *) actual=$("$name" --version) ;;
  esac
  actual=${actual%%$'\n'*}
  [[ $actual == "$version" || $actual == *" $version" || $actual == *" $version "* ]] || { echo "doctor: $name requires $version; run just setup" >&2; exit 1; }
done
rust_version=$(sed -n 's/^channel = "\(.*\)"/\1/p' apps/server/rust-toolchain.toml)
[[ $(cd apps/server && rustc --version) == "rustc $rust_version "* ]] || exit 1
node_version=$(cat .node-version)
[[ $(node --version) == "v$node_version" ]] || { echo "doctor: node requires $node_version" >&2; exit 1; }
bun_version=$(node -p 'JSON.parse(require("node:fs").readFileSync("package.json")).packageManager.split("@")[1]')
[[ $(bun --version) == "$bun_version" ]] || { echo "doctor: bun requires $bun_version" >&2; exit 1; }
[[ $(git config --get core.hooksPath) == .vite-hooks ]] || { echo "doctor: run just setup to enable the commit gate" >&2; exit 1; }
[[ -d node_modules && -d apps/web-2/node_modules && -d .claude/skills ]] || { echo "doctor: run just setup for dependencies and skill copies" >&2; exit 1; }
echo "doctor: pinned tools, dependencies and commit hook available"
echo "Rust build jobs: $("$just_bin" --justfile apps/server/justfile --evaluate CARGO_BUILD_JOBS)"
echo "Rust cache: $("$just_bin" --justfile apps/server/justfile --evaluate CARGO_TARGET_DIR)"
if command -v docker >/dev/null || command -v podman >/dev/null; then
  echo "Container CLI available (start services with just dev-up)"
else
  echo "No container CLI: use just server check and just server test-unit"
fi
