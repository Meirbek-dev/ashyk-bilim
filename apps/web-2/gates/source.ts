// Source-tree gates: G-07 api-coverage, G-10 trace, G-11 tokens, G-12 suppressions, doc sizes (8.2).
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import { allowlist, appDir, type Finding, matches, read, repoDir, sdkOperations, usesOperation, walk } from './lib.ts'

const CODE = /\.(ts|tsx)$/

export function apiCoverage(phaseOverride?: number): { findings: Finding[]; enforced: boolean; summary: string } {
  const policy = allowlist().apiCoverage
  const service = new Set(policy.serviceOperations.map(entry => entry.operation))
  const sources = walk('src', CODE).map(read).join('\n')
  const unused = sdkOperations().filter(operation => !service.has(operation) && !usesOperation(sources, operation))
  const phase = phaseOverride ?? policy.phase
  const findings = unused.map(operation => ({
    file: 'src/shared/api/gen/sdk.gen.ts',
    rule: 'api-coverage',
    fix: `no consumer for ${operation}(): build its UI or delete the operation from the server`,
  }))
  const summary = `api-coverage: ${unused.length} of ${sdkOperations().length} operations without a consumer (phase ${phase}, enforced from ${policy.enforceFromPhase})`
  return { findings, enforced: phase >= policy.enforceFromPhase, summary }
}

/** Route files still rendering the shared UnderConstruction stub (phase 1.2b); each slice replaces its own. */
export function underConstruction(phaseOverride?: number): { findings: Finding[]; enforced: boolean; summary: string } {
  const policy = allowlist().underConstruction
  const findings = walk('src/routes', CODE).flatMap(file =>
    matches(read(file), /\bcomponent: UnderConstruction\b/).map(({ line }) => ({
      file,
      line,
      rule: 'under-construction',
      fix: 'build the slice and bind its component here',
    })),
  )
  const phase = phaseOverride ?? policy.phase
  const summary = `under-construction: ${findings.length} route(s) still stubbed (phase ${phase}, enforced from ${policy.enforceFromPhase})`
  return { findings, enforced: phase >= policy.enforceFromPhase, summary }
}

const TEST_FILE = /(\.test\.tsx?|\.spec\.ts)$/
const BEHAVIOR_ID = /\bB-[A-Z]+-\d+\b/

export function trace(): Finding[] {
  const findings: Finding[] = []
  const testFiles = [...walk('src', TEST_FILE), ...(existsSync(resolve(appDir, 'e2e')) ? walk('e2e', TEST_FILE) : [])]
  const tested = new Map<string, string>()
  for (const file of testFiles)
    for (const match of matches(read(file), BEHAVIOR_ID)) tested.set(match.text, `${file}:${match.line}`)
  const specified = new Set<string>()
  for (const spec of walk('src/features', /\/SPEC\.md$/)) {
    const text = read(spec)
    const feature = spec.split('/')[2] ?? ''
    for (const { text: id, line } of matches(text, /^- (B-[A-Z]+-\d+)/m)) {
      const behavior = id.slice(2)
      specified.add(behavior)
      if (!tested.has(behavior))
        findings.push({ file: spec, line, rule: 'trace-untested', fix: `add a test titled "${behavior} ..."` })
    }
    const operationsLine = /^(Операции|Operations): *(.*)$/m.exec(text)
    if (!operationsLine)
      findings.push({ file: spec, rule: 'trace-operations', fix: 'add the "Операции: a, b" line (8.3)' })
    const featureSource = walk(`src/features/${feature}`, CODE).map(read).join('\n')
    for (const operation of (operationsLine?.[2] ?? '').split(/[,\s]+/).filter(Boolean)) {
      if (!usesOperation(featureSource, operation)) {
        findings.push({
          file: spec,
          rule: 'trace-operation-unused',
          fix: `features/${feature} never calls ${operation}(): use it or drop it from the list`,
        })
      }
    }
  }
  for (const [id, where] of tested) {
    if (!specified.has(id))
      findings.push({
        file: where,
        rule: 'trace-unknown-id',
        fix: `${id} is in no SPEC.md: fix the id or add the behavior`,
      })
  }
  return findings
}

const PALETTE =
  /\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|shadow|accent|caret|divide|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(?:-\d{2,3})?\b/
const TOKEN_RULES: [RegExp, string, string][] = [
  [PALETTE, 'tokens-palette', 'use a token class (bg-primary, text-muted-foreground, border-border...)'],
  // A class variant (`dark:bg-x`), not an object key (`dark: m.ui_mode_dark`).
  [/\bdark:(?=[\w[!-])/, 'tokens-dark-variant', 'dark mode comes from light-dark() tokens: drop the dark: variant'],
  [
    /\b[a-z][\w-]*-\[[^\]\s]+\]/,
    'tokens-arbitrary-value',
    'use the Tailwind scale or a token, not an arbitrary [value]',
  ],
  [/\bstyle=\{/, 'tokens-inline-style', 'use Tailwind classes on tokens instead of style={}'],
  [/#[0-9a-fA-F]{3,8}\b/, 'tokens-hex', 'colors live in src/styles/ tokens and public/themes/'],
]

export function tokens(): Finding[] {
  const files = [...walk('src', CODE), ...walk('src', /\.css$/).filter(file => !file.startsWith('src/styles/'))]
  return files.flatMap(file =>
    TOKEN_RULES.flatMap(([pattern, rule, fix]) =>
      matches(read(file), pattern).map(({ line }) => ({ file, line, rule, fix })),
    ),
  )
}

// Built from parts so this file does not match itself.
const SUPPRESSIONS: [RegExp, string, string][] = [
  [
    new RegExp(['(oxlint|eslint)', '-disable'].join('')),
    'lint-disable',
    'fix the finding; the rule is an error for a reason',
  ],
  [
    new RegExp(['@ts-', '(expect-error|ignore|nocheck)'].join('')),
    'ts-suppression',
    'fix the type instead of silencing it',
  ],
  [
    new RegExp(['\\bas ', '(any|unknown as)\\b'].join('')),
    'unsafe-cast',
    'use the contract types as they are; narrow with a check',
  ],
  [new RegExp(['\\.(skip|fixme|only)', '\\('].join('')), 'test-skip', 'run the test or delete it'],
  [
    new RegExp(['\\b(TO', 'DO|FIX', 'ME)\\b'].join('')),
    'todo-comment',
    'do it now, or record it in gates/allowlist.json with a reason',
  ],
]

export function suppressions(): Finding[] {
  const allowed = allowlist().suppressions
  const roots = ['src', 'gates', ...(existsSync(resolve(appDir, 'e2e')) ? ['e2e'] : [])]
  const files = [...roots.flatMap(root => walk(root, CODE)), 'vite.config.ts', 'serve.ts', 'openapi-ts.config.ts']
  return files.flatMap(file =>
    SUPPRESSIONS.flatMap(([pattern, rule, fix]) =>
      allowed.some(entry => entry.file === file && entry.rule === rule)
        ? []
        : matches(read(file), pattern).map(({ line }) => ({ file, line, rule, fix })),
    ),
  )
}

const DOC_LIMITS: [string, number][] = [
  ['AGENTS.md', 120],
  ['../../docs/web/DESIGN.md', 200],
]

export function docs(): Finding[] {
  const findings: Finding[] = []
  const limits = [...DOC_LIMITS, ...walk('src/features', /\/SPEC\.md$/).map((spec): [string, number] => [spec, 150])]
  for (const [file, limit] of limits) {
    if (!existsSync(resolve(appDir, file))) continue
    const lines = read(file).trimEnd().split('\n').length
    if (lines > limit) findings.push({ file, rule: 'doc-size', fix: `${lines} lines, limit ${limit}: cut it` })
  }
  const decisions = resolve(repoDir, 'docs/DECISIONS.md')
  const web = existsSync(decisions)
    ? /^## Web \(stage 2\)[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(read(decisions))
    : null
  for (const entry of web?.[1]?.split(/^(?=- )/m) ?? []) {
    const lines = entry.trimEnd().split('\n').length
    if (lines > 15)
      findings.push({
        file: '../../docs/DECISIONS.md',
        rule: 'doc-size',
        fix: `a "Web" entry has ${lines} lines, limit 15`,
      })
  }
  return findings
}
