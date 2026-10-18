// Every check that lint cannot express (spec 9). `bun gates/gates.ts <gate|all> [--phase N]`; `next-id <feature>`.
// Output is errors only: `file:line rule - what to do`, at most 30 lines per gate plus a count (8.4).
import { readFileSync } from 'node:fs'

import { contract } from './contract.ts'
import { i18n } from './i18n.ts'
import { allowlist, type Finding } from './lib.ts'
import { codegenDrift, freeze, knip } from './repo.ts'
import { apiCoverage, docs, nextBehaviorId, suppressions, tokens, trace, underConstruction } from './source.ts'

const MAX_LINES = 30
const phaseFlag = process.argv.indexOf('--phase')
const phase = phaseFlag > 0 ? Number(process.argv[phaseFlag + 1]) : undefined

function coverage(): Finding[] {
  const result = apiCoverage(phase)
  if (result.enforced) return result.findings
  process.stdout.write(`${result.summary} - report only (gates/allowlist.json apiCoverage)\n`)
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
  'api-coverage': coverage, // G-07
  'under-construction': stubs, // stub routes, enforced from phase 7
  contract: contractGate, // G-08
  codegen: codegenDrift, // G-09
  trace, // G-10
  tokens, // G-11
  suppressions, // G-12
  freeze, // G-13
  docs, // 8.2
}

function print(gate: string, findings: Finding[]): void {
  const lines = findings.map(f => `${f.file}${f.line ? `:${f.line}` : ''} ${f.rule} - ${f.fix}`)
  const shown = lines.slice(0, MAX_LINES)
  if (lines.length > MAX_LINES) shown.push(`... and ${lines.length - MAX_LINES} more`)
  process.stdout.write(`\n${gate}: ${findings.length} error(s)\n${shown.join('\n')}\n`)
}

// Not a gate: the id a new behavior of a feature gets (`bun gates/gates.ts next-id analytics` -> B-ANL-35).
if (process.argv[2] === 'next-id') {
  const feature = process.argv[3] ?? ''
  process.stdout.write(`${nextBehaviorId(readFileSync(`src/features/${feature}/SPEC.md`, 'utf8'))}\n`)
  process.exit(0)
}

const requested = process.argv[2] ?? 'all'
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
  }
}
if (failed > 0) {
  process.stdout.write(`\ngates: ${failed} of ${names.length} red\n`)
  process.exit(1)
}
