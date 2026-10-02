#!/bin/sh
# Claude Code Stop / SubagentStop: `vp run verify` for apps/web-2 when the agent's tree differs from
# HEAD there (spec 8.1). The tree is the one the agent works in (payload cwd), so worktrees are
# checked in place. Exit 2 keeps the turn open; a second stop in a row passes (stop_hook_active),
# so an unfixable red cannot loop the agent.
set -u

red() {
  printf 'hook-stop: %s\n' "$1" >&2
  exit 2
}

command -v node >/dev/null 2>&1 || red 'node is not on PATH: the gates cannot run'
command -v git >/dev/null 2>&1 || red 'git is not on PATH: the gates cannot run'
payload=$(cat)
# Prints "<active 0|1> <cwd>".
info=$(printf '%s' "$payload" | node -e '
let s = ""
process.stdin.on("data", d => (s += d)).on("end", () => {
  const j = JSON.parse(s || "{}")
  process.stdout.write(`${j.stop_hook_active ? 1 : 0} ${(j.cwd ?? process.cwd()).replaceAll("\\", "/")}`)
})') || red 'could not read the hook payload'
[ "${info%% *}" = 1 ] && exit 0
cwd=${info#* }

root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null) || exit 0
[ -d "$root/apps/web-2" ] || exit 0
[ -z "$(git -C "$root" status --porcelain -- apps/web-2 | head -1)" ] && exit 0

[ -d "$root/apps/web-2/node_modules" ] || red "$root/apps/web-2 has no node_modules: run 'bun install && bun run codegen' there"
cd "$root/apps/web-2" || red "cannot enter $root/apps/web-2"
if out=$(vp run verify 2>&1); then
  exit 0
fi
printf 'apps/web-2 is red (vp run verify) - fix it before ending the turn:\n\n%s\n' "$out" | tail -n 80 >&2
exit 2
