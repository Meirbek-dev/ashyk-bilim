#!/usr/bin/env node
/**
 * lint-report.mjs
 *
 * Runs oxlint and prints a sorted issue count per rule.
 *
 * Usage:
 *   node scripts/lint-report.mjs             # lint whole project
 *   node scripts/lint-report.mjs src/        # lint a subdirectory
 *   node scripts/lint-report.mjs --top 20    # show only top 20 rules
 *   node scripts/lint-report.mjs src/ --top 10
 */

import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

// ── CLI args ────────────────────────────────────────────────────────────────

const rawArgs = process.argv.slice(2)
const topIdx = rawArgs.indexOf('--top')
const topN = topIdx !== -1 ? Number(rawArgs[topIdx + 1]) : Infinity

if (topIdx !== -1 && (Number.isNaN(topN) || topN <= 0)) {
  process.stderr.write('Usage: --top <number>  (positive integer)\n')
  process.exit(1)
}

// Strip --top and its value; leave everything else for oxlint
const passArgs = topIdx === -1 ? rawArgs : rawArgs.filter((_, i) => i !== topIdx && i !== topIdx + 1)

// Include --type-aware and --type-check by default to find all issues
// matching package.json's configuration.
const defaultFlags = ['--type-aware', '--type-check']
const extraFlags = defaultFlags.filter(flag => !passArgs.includes(flag))

const hasTarget = passArgs.some(a => !a.startsWith('-'))
const lintArgs = hasTarget ? [...extraFlags, ...passArgs] : ['.', ...extraFlags, ...passArgs]

// ── Locate oxlint binary ────────────────────────────────────────────────────

// Windows: executables in node_modules/.bin are .cmd wrappers and require
// shell: true to spawn. On POSIX the shebang binary works directly.
const isWindows = process.platform === 'win32'
const ext = isWindows ? '.cmd' : ''
const localBin = resolve(`node_modules/.bin/oxlint${ext}`)
const hasLocal = existsSync(localBin)

// On Windows we always use shell:true so that cmd/npx wrappers resolve.
// On POSIX we avoid it to prevent argument-injection quirks.
const useShell = isWindows

const [cmd, ...baseArgs] = hasLocal
  ? [localBin]
  : isWindows
    ? ['npx', '--yes', 'oxlint'] // shell:true will find npx.cmd
    : ['npx', '--yes', 'oxlint']

// ── Run oxlint ──────────────────────────────────────────────────────────────

process.stderr.write('Running oxlint…\n')

const result = spawnSync(cmd, [...baseArgs, '--format', 'json', ...lintArgs], {
  encoding: 'utf8',
  maxBuffer: 200 * 1024 * 1024, // 200 MB — large monorepos can be verbose
  cwd: process.cwd(),
  shell: useShell,
})

// oxlint exits 0 (clean) or 1 (found issues) — both are expected
if (result.status !== 0 && result.status !== 1) {
  process.stderr.write(`oxlint exited unexpectedly with code ${result.status}\n`)
  if (result.stderr) process.stderr.write(result.stderr + '\n')
  if (result.error) process.stderr.write(result.error.message + '\n')
  process.exit(result.status ?? 2)
}

// ── Parse ───────────────────────────────────────────────────────────────────

// oxlint writes JSON to stdout. However some environments (Bun on Windows)
// route child-process stdout through stderr in certain pipe configurations.
// We try stdout first, then stderr, and accept whichever looks like JSON.
const candidates = [result.stdout, result.stderr]
  .map(s => (typeof s === 'string' ? s : '').trim())
  .filter(s => s.startsWith('[') || s.startsWith('{'))

const raw = candidates[0] ?? ''

if (!raw) {
  process.stderr.write('oxlint produced no JSON output.\n')
  process.stderr.write(`stdout: ${String(result.stdout).slice(0, 300)}\n`)
  process.stderr.write(`stderr: ${String(result.stderr).slice(0, 300)}\n`)
  process.exit(1)
}

let parsed
try {
  parsed = JSON.parse(raw)
} catch (error) {
  process.stderr.write(`Failed to parse oxlint JSON output: ${error.message}\n`)
  process.stderr.write('Raw output (first 500 chars):\n' + raw.slice(0, 500) + '\n')
  process.exit(1)
}

// ── Aggregate ───────────────────────────────────────────────────────────────

/** @type {Map<string, { count: number; files: Set<string>; severity: number }>} */
const byRule = new Map()
const affectedFiles = new Set()

const addIssue = (rule, filePath, severity) => {
  const sevNum = severity === 2 || severity === 'error' ? 2 : 1
  if (!byRule.has(rule)) {
    byRule.set(rule, { count: 0, files: new Set(), severity: sevNum })
  }
  const entry = byRule.get(rule)
  entry.count += 1
  entry.files.add(filePath)
  affectedFiles.add(filePath)
}

if (Array.isArray(parsed)) {
  // Standard ESLint-compatible format: array of file results
  for (const file of parsed) {
    for (const msg of file.messages ?? []) {
      addIssue(msg.ruleId ?? '(unknown)', file.filePath, msg.severity)
    }
  }
} else if (parsed && typeof parsed === 'object') {
  if (Array.isArray(parsed.diagnostics)) {
    // Flat oxlint diagnostics format: array of individual diagnostic messages
    for (const diag of parsed.diagnostics) {
      addIssue(diag.code ?? '(unknown)', diag.filename, diag.severity)
    }
  } else {
    // Other wrapped formats e.g. { results: [...] } or { files: [...] }
    const inner = parsed.results ?? parsed.files ?? null
    if (Array.isArray(inner)) {
      for (const file of inner) {
        for (const msg of file.messages ?? []) {
          addIssue(msg.ruleId ?? '(unknown)', file.filePath, msg.severity)
        }
      }
    } else {
      process.stderr.write('Unexpected oxlint JSON shape.\n')
      process.stderr.write('Received: ' + raw.slice(0, 400) + '\n')
      process.exit(1)
    }
  }
}

if (byRule.size === 0) {
  process.stdout.write('\n✓  No issues found.\n\n')
  process.exit(0)
}

const sorted = [...byRule.entries()].toSorted((a, b) => b[1].count - a[1].count)
const visible = sorted.slice(0, topN)
const totalIssues = sorted.reduce((s, [, v]) => s + v.count, 0)

// ── ANSI helpers ─────────────────────────────────────────────────────────────

const { isTTY } = process.stdout
const c = {
  reset: isTTY ? '\x1b[0m' : '',
  bold: isTTY ? '\x1b[1m' : '',
  dim: isTTY ? '\x1b[2m' : '',
  red: isTTY ? '\x1b[31m' : '',
  yellow: isTTY ? '\x1b[33m' : '',
  cyan: isTTY ? '\x1b[36m' : '',
  green: isTTY ? '\x1b[32m' : '',
  white: isTTY ? '\x1b[97m' : '',
}

const SEV_LABEL = { 1: `${c.yellow}warn ${c.reset}`, 2: `${c.red}error${c.reset}` }
const pad = (s, w) => String(s).padEnd(w)

// ── Render ──────────────────────────────────────────────────────────────────

const W = 80
const bar = c.dim + '─'.repeat(W) + c.reset
const hiddenN = sorted.length - visible.length
const pluralS = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`

const lines = []
lines.push('')
lines.push(bar)
lines.push(
  `  ${c.bold}oxlint report${c.reset}` +
    `  ${c.white}${totalIssues} issues${c.reset}` +
    `  ${c.dim}in ${pluralS(affectedFiles.size, 'file')} · ${pluralS(sorted.length, 'rule')}${c.reset}`,
)
lines.push(bar)
lines.push(`  ${c.bold}${pad('COUNT', 8)}${pad('FILES', 8)}${pad('SEV', 8)}RULE${c.reset}`)
lines.push(bar)

for (const [rule, { count, files: ruleFiles, severity }] of visible) {
  const pct = ((count / totalIssues) * 100).toFixed(1).padStart(5)
  const sev = SEV_LABEL[severity] ?? '?    '
  const name = severity === 2 ? `${c.white}${rule}${c.reset}` : `${c.dim}${rule}${c.reset}`

  lines.push(
    `  ${c.cyan}${pad(count, 8)}${c.reset}` +
      `${c.dim}${pad(ruleFiles.size, 8)}${c.reset}` +
      `${sev} ${pad('', 2)}` +
      name +
      `${c.dim}  ${pct}%${c.reset}`,
  )
}

lines.push(bar)

if (hiddenN > 0) {
  lines.push(
    `  ${c.dim}… ${hiddenN} more rule${hiddenN === 1 ? '' : 's'} hidden (use --top ${sorted.length} to show all)${c.reset}`,
  )
  lines.push(bar)
}

lines.push('')
process.stdout.write(lines.join('\n') + '\n')
