#!/bin/sh
# Claude Code PostToolUse (Write|Edit): types + lint of apps/web right after one of its .ts/.tsx
# files changes (spec 8.1). The app dir is taken from the edited file's own path, so an agent in a
# git worktree checks its worktree, not the main tree. Exit 2 returns the errors to the agent.
set -u

red() {
  printf 'hook-post-edit: %s\n' "$1" >&2
  exit 2
}

command -v node >/dev/null 2>&1 || red 'node is not on PATH: the check cannot run'
payload=$(cat)
# Prints "<app dir>" for a .ts/.tsx file under apps/web that is not generated; nothing otherwise.
app=$(printf '%s' "$payload" | node -e '
let s = ""
process.stdin.on("data", d => (s += d)).on("end", () => {
  const path = require("node:path")
  const j = JSON.parse(s)
  const raw = j.tool_input?.file_path ?? j.tool_response?.filePath ?? ""
  const file = path.resolve(j.cwd ?? ".", raw).replaceAll("\\", "/")
  const at = file.lastIndexOf("/apps/web/")
  if (at < 0 || !/\.tsx?$/.test(file)) return
  if (/\/(node_modules|paraglide|gen\.check-tmp)\/|\/src\/shared\/api\/gen\/|routeTree(\.gen|\.check-tmp)\.ts$/.test(file)) return
  process.stdout.write(file.slice(0, at) + "/apps/web")
})') || red 'could not read the hook payload'
[ -z "$app" ] && exit 0

[ -d "$app/node_modules" ] || red "$app has no node_modules: run 'bun install && bun run codegen' there"
cd "$app" || red "cannot enter $app"
if out=$(vp check --no-fmt 2>&1); then
  exit 0
fi
printf 'vp check fails in %s after this edit:\n\n%s\n' "$app" "$out" >&2
exit 2
