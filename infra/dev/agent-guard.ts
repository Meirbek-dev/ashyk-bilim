#!/usr/bin/env bun
// Claude Code PreToolUse hook (.claude/settings.json) on Bash and PowerShell: refuses the shell commands that cost
// agents whole turns, and the commits that skip this repo's checks. Exit 2 = blocked; stderr goes back to the agent.
//
// 1. A bare `python` / `python3` (or `python -` with no heredoc and nothing piped in): in Git Bash the Windows
//    launcher opens an interactive REPL that never ends and floods its output file (64 MB seen).
// 2. `node -e "..."` / `bun -e "..."` whose double-quoted script holds a backtick: bash runs the backtick as a command
//    substitution before node sees it, and the edit lands mangled.
// 3. `jj commit`, `jj git push` and `--no-verify`: jj runs no git hooks, so these land unchecked work (the 2026-10-28
//    night sweep committed 35 type-aware lint errors that only the final `just check` caught). `just commit` / `just push` run the same checks under jj and git.

export function verdict(command: string): string | null {
  if (!command.includes('<<')) {
    // Only in command position (start, after ; & | ( or a newline): `echo py` or `grep python3 x` is an argument.
    for (const match of command.matchAll(/(^|[;&|(\n])\s*(python3?|py)(\.exe)?(\s+-)?(?=\s*($|[;&)\n|]|\d?>))/g)) {
      // After a single `|` the REPL reads the pipe, not the terminal: it ends.
      const piped = match[1] === '|' && command[match.index - 1] !== '|'
      if (!piped)
        return 'agent-guard: a bare python/python3 opens an interactive REPL here and never returns. Give it a script file, `-c "..."`, or a quoted heredoc (`python3 - <<\'EOF\'`).'
    }
  }
  for (const match of command.matchAll(/\b(node|bun)(\.exe)?\s+(-e|-p|--eval|--print)\s+"/g)) {
    let end = match.index + match[0].length
    while (end < command.length && !(command[end] === '"' && command[end - 1] !== '\\')) end++
    if (command.slice(match.index + match[0].length, end).includes('`'))
      return `agent-guard: a backtick inside ${match[1]} -e "..." is run by bash as a command before ${match[1]} sees it. Write the script with the Write tool or a quoted heredoc (\`${match[1]} - <<'EOF'\`), or edit the file with the Edit tool.`
  }
  const vcs = /(^|[;&|(\n])\s*(jj\s+(commit|ci|git\s+push)\b|git\s+(commit|push)\b[^;&|\n]*\s(--no-verify|-n)\b)/.exec(
    command,
  )
  if (vcs)
    return `agent-guard: \`${vcs[2]!.trim()}\` skips this repo's commit/push checks (jj runs no git hooks). Use \`just commit -m "..." [paths]\` and \`just push\` (skill ship); never --no-verify.`
  return null
}

if (import.meta.main) {
  const input = (await Bun.stdin.json()) as { tool_input?: { command?: string } }
  const reason = verdict(input.tool_input?.command ?? '')
  if (reason) {
    process.stderr.write(`${reason}\n`)
    process.exit(2)
  }
}
