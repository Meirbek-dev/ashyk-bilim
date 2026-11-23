#!/usr/bin/env bun
// `just ast-grep [paths]`: the structural code rules (sgconfig.yml, rules/, tests in rule-tests/). Runs the rule tests,
// then the scan; prints `file:line rule - message` (at most 30 lines plus a count) and logs every hit to
// tmp/gates/hits.jsonl (source `ast-grep`). A new check of one file's code is a rule with a test, not a script.
// A line-scoped exception: `// ast-grep-ignore: <rule> -- why` on the line above.
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { recordHits } from './ledger.ts'

const root = resolve(import.meta.dir, '../..')
const MAX_LINES = 30

export type Match = {
  file: string
  ruleId: string
  severity: string
  message: string
  range: { start: { line: number } }
}

/** The pinned binary from the root package.json (`bun install`), else one on PATH. */
function binary(): string {
  const local = resolve(root, 'node_modules/.bin', process.platform === 'win32' ? 'ast-grep.exe' : 'ast-grep')
  return existsSync(local) ? local : 'ast-grep'
}

function run(args: string[]): { code: number; out: string; err: string } {
  const p = Bun.spawnSync([binary(), ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe', windowsHide: true })
  return { code: p.exitCode ?? 1, out: p.stdout.toString(), err: p.stderr.toString() }
}

/** `--json=stream` output: one match per line; errors fail, warnings print. */
export function parse(stream: string): Match[] {
  return stream
    .split('\n')
    .filter(line => line.trim().startsWith('{'))
    .map(line => JSON.parse(line) as Match)
}

export function format(matches: Match[]): string[] {
  const lines = matches.map(
    m => `${m.file.replaceAll('\\', '/')}:${m.range.start.line + 1} ${m.ruleId} - ${m.message.split('\n')[0]}`,
  )
  return lines.length > MAX_LINES ? [...lines.slice(0, MAX_LINES), `... and ${lines.length - MAX_LINES} more`] : lines
}

function main(): void {
  const test = run(['test', '--skip-snapshot-tests'])
  if (test.code !== 0) {
    process.stdout.write(`${test.out}${test.err}`.trim().split('\n').slice(-30).join('\n') + '\n')
    process.stdout.write('ast-grep: a rule test failed (rule-tests/): fix the rule or its valid/invalid cases\n')
    recordHits('ast-grep', [{ gate: 'rule-test' }])
    process.exit(1)
  }
  const scan = run(['scan', '--json=stream', ...process.argv.slice(2)])
  let matches: Match[]
  try {
    matches = parse(scan.out)
  } catch {
    matches = []
  }
  // Exit 1 with matches is a red scan; anything else non-zero is a config or parse error.
  if (scan.code !== 0 && matches.length === 0) {
    process.stdout.write(`ast-grep scan did not run:\n${scan.err.trim().split('\n').slice(0, 20).join('\n')}\n`)
    recordHits('ast-grep', [{ gate: 'scan-crashed' }])
    process.exit(1)
  }
  const errors = matches.filter(m => m.severity === 'error')
  const rest = matches.filter(m => m.severity !== 'error')
  if (rest.length) process.stdout.write(`ast-grep: ${rest.length} warning(s)\n${format(rest).join('\n')}\n`)
  if (errors.length === 0) {
    process.stdout.write(`ast-grep: rule tests and scan clean\n`)
    return
  }
  process.stdout.write(`ast-grep: ${errors.length} finding(s)\n${format(errors).join('\n')}\n`)
  recordHits(
    'ast-grep',
    errors.map(m => ({ gate: m.ruleId, rule: m.ruleId, file: m.file.replaceAll('\\', '/') })),
  )
  process.exit(1)
}

if (import.meta.main) main()
