#!/usr/bin/env bun
// Claude Code PreToolUse hook (.claude/settings.json) on Bash and PowerShell: refuses the two shell commands that
// cost agents whole turns on this machine. Exit 2 = blocked; the message on stderr goes back to the agent.
//
// 1. A bare `python` / `python3` (or `python -` with no heredoc and nothing piped in): in Git Bash the Windows
//    launcher opens an interactive REPL that never ends and floods its output file (64 MB seen).
// 2. `node -e "..."` / `bun -e "..."` whose double-quoted script holds a backtick: bash runs the backtick as a command
//    substitution before node sees it, and the edit lands mangled.

export function verdict(command: string): string | null {
  if (!command.includes('<<')) {
    for (const match of command.matchAll(/(^|[\s;&(])(python3?|py)(\.exe)?(\s+-)?(?=\s*($|[;&)\n|]|\d?>))/g)) {
      const before = command.slice(0, match.index + (match[1]?.length ?? 0)).trimEnd()
      if (!before.endsWith('|'))
        return 'agent-guard: a bare python/python3 opens an interactive REPL here and never returns. Give it a script file, `-c "..."`, or a quoted heredoc (`python3 - <<\'EOF\'`).'
    }
  }
  for (const match of command.matchAll(/\b(node|bun)(\.exe)?\s+(-e|-p|--eval|--print)\s+"/g)) {
    let end = match.index + match[0].length
    while (end < command.length && !(command[end] === '"' && command[end - 1] !== '\\')) end++
    if (command.slice(match.index + match[0].length, end).includes('`'))
      return `agent-guard: a backtick inside ${match[1]} -e "..." is run by bash as a command before ${match[1]} sees it. Write the script with the Write tool or a quoted heredoc (\`${match[1]} - <<'EOF'\`), or edit the file with the Edit tool.`
  }
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
