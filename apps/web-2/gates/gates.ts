// `bun gates/gates.ts <gate|all> [--phase N]`; api-coverage is an optional usage report.
// Output is errors only: `file:line rule - what to do`, at most 30 lines per gate plus a count (8.4).
import { spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { contract } from './contract.ts'
import { i18n } from './i18n.ts'
import { allowlist, type Finding } from './lib.ts'
import { codegenDrift, knip } from './repo.ts'
import { apiCoverage, tokens, underConstruction } from './source.ts'

const MAX_LINES = 30
const phaseFlag = process.argv.indexOf('--phase')
const phase = phaseFlag > 0 ? Number(process.argv[phaseFlag + 1]) : undefined

function coverage(): Finding[] {
  const result = apiCoverage()
  process.stdout.write(`${result.summary} - report only\n`)
  print('api-coverage (report only)', result.findings)
  return []
}

// Report-only until phase 7: the summary always, the route list when the gate is run on its own.
function stubs(): Finding[] {
  const result = underConstruction(phase)
  if (result.enforced) return result.findings
  process.stdout.write(`${result.summary} - report only (gates/allowlist.json underConstruction)\n`)
  // Run on its own, it lists every stubbed route (one line each), not just the first 30.
  if (process.argv[2] === 'under-construction')
    process.stdout.write(
      result.findings
        .map(
          finding => `${finding.file}:${finding.line}
`,
        )
        .join(''),
    )
  return []
}

// Report-only while the server contract cleanup (S-01) is in flight; the allowlist entry is removed when it lands.
function contractGate(): Finding[] {
  const findings = contract()
  if (!allowlist().contractReportOnly) return findings
  process.stdout.write(`contract: ${findings.length} finding(s) - report only (gates/allowlist.json contractReportOnly)
`)
  return []
}

const GATES: Record<string, () => Finding[] | Promise<Finding[]>> = {
  i18n, // G-03
  knip, // G-04
  'under-construction': stubs, // stub routes, enforced from phase 7
  contract: contractGate, // G-08
  codegen: codegenDrift, // G-09
  tokens, // G-11
}

// One line per finding in <main checkout>/tmp/gates/hits.jsonl (infra/dev/ledger.ts): `just metrics` shows which gates
// caught something lately. Local runs only; never fails a gate.
function recordHits(gate: string, findings: Finding[]): void {
  if (process.env['CI']) return
  try {
    const common = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' })
    if (common.status !== 0) return
    const ledger = join(dirname(common.stdout.trim()), 'tmp', 'gates', 'hits.jsonl')
    mkdirSync(dirname(ledger), { recursive: true })
    const at = new Date().toISOString()
    const lines = findings.map(f => JSON.stringify({ at, source: 'web2-gates', gate, rule: f.rule, file: f.file }))
    appendFileSync(ledger, `${lines.join('\n')}\n`)
  } catch {
    // A statistic only.
  }
}

function print(gate: string, findings: Finding[]): void {
  const lines = findings.map(f => `${f.file}${f.line ? `:${f.line}` : ''} ${f.rule} - ${f.fix}`)
  const shown = lines.slice(0, MAX_LINES)
  if (lines.length > MAX_LINES) shown.push(`... and ${lines.length - MAX_LINES} more`)
  process.stdout.write(`\n${gate}: ${findings.length} finding(s)\n${shown.join('\n')}\n`)
}

const requested = process.argv[2] ?? 'all'
if (requested === 'api-coverage') {
  coverage()
  process.exit(0)
}
const names = requested === 'all' ? Object.keys(GATES) : [requested]
let failed = 0
for (const name of names) {
  const gate = GATES[name]
  if (!gate) {
    process.stderr.write(`unknown gate "${name}"; one of: all, ${Object.keys(GATES).join(', ')}\n`)
    process.exit(2)
  }
  let findings: Finding[]
  try {
    findings = await gate()
  } catch (error) {
    // A gate that cannot run is red (spec 4.1).
    findings = [{ file: 'gates', rule: `${name}-crashed`, fix: error instanceof Error ? error.message : String(error) }]
  }
  if (findings.length > 0) {
    failed += 1
    print(name, findings)
    recordHits(name, findings)
  }
}
if (failed > 0) {
  process.stdout.write(`\ngates: ${failed} of ${names.length} red\n`)
  process.exit(1)
}
