// API usage reporting, unfinished-route detection and theme color checks.

import {
  allowlist,
  type Finding,
  deprecatedOperations,
  matches,
  read,
  sdkOperations,
  serverRemovals,
  usesOperation,
  walk,
} from './lib.ts'

const CODE = /\.(ts|tsx)$/

export function apiCoverage(): { findings: Finding[]; enforced: boolean; summary: string } {
  const policy = allowlist().apiCoverage
  const service = new Set(policy.serviceOperations.map(entry => entry.operation))
  const removals = new Set(serverRemovals().map(entry => entry.operation))
  const sources = walk('src', CODE).map(read).join('\n')
  const deprecated = deprecatedOperations()
  const all = sdkOperations()
  const operations = all.filter(operation => !deprecated.has(operation))
  const unused = operations.filter(
    operation => !service.has(operation) && !removals.has(operation) && !usesOperation(sources, operation),
  )
  const findings: Finding[] = unused.map(operation => ({
    file: 'src/shared/api/gen/sdk.gen.ts',
    rule: 'api-coverage',
    fix: `no consumer for ${operation}(): review its consumers, including integrations and other clients`,
  }))
  for (const operation of service)
    if (!all.includes(operation))
      findings.push({
        file: 'gates/allowlist.json',
        rule: 'api-coverage',
        fix: `service operation ${operation} is gone: drop it`,
      })
  // A scheduled removal must still exist and still be unused, or the list lies to the server lane.
  for (const operation of removals) {
    if (!all.includes(operation))
      findings.push({ file: 'gates/server-removals.json', rule: 'api-coverage', fix: `${operation} is gone: drop it` })
    else if (usesOperation(sources, operation))
      findings.push({
        file: 'gates/server-removals.json',
        rule: 'api-coverage',
        fix: `${operation} has a consumer now: drop it from the removal list`,
      })
  }
  const summary = `api-coverage: ${unused.length} of ${operations.length} operations without a consumer, ${removals.size} scheduled for server removal (${deprecated.size} deprecated skipped)`
  return { findings, enforced: false, summary }
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

const PALETTE =
  /\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|decoration|shadow|accent|caret|divide|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(?:-\d{2,3})?\b/
const TOKEN_RULES: [RegExp, string, string][] = [
  [PALETTE, 'tokens-palette', 'use a token class (bg-primary, text-muted-foreground, border-border...)'],
  // A class variant (`dark:bg-x`), not an object key (`dark: m.ui_mode_dark`).
  [/\bdark:(?=[\w[!-])/, 'tokens-dark-variant', 'dark mode comes from light-dark() tokens: drop the dark: variant'],
  [/#[0-9a-fA-F]{3,8}\b/, 'tokens-hex', 'colors live in src/styles/ tokens and public/themes/'],
]

// Stock shadcn output (`bunx shadcn add`) is exempt: its classes are the generator's; our code builds on it.
const STOCK_KIT = 'src/shared/ui/'

export function tokens(): Finding[] {
  const files = [...walk('src', CODE), ...walk('src', /\.css$/).filter(file => !file.startsWith('src/styles/'))].filter(
    file => !file.startsWith(STOCK_KIT),
  )
  return files.flatMap(file =>
    TOKEN_RULES.flatMap(([pattern, rule, fix]) =>
      matches(read(file), pattern).map(({ line }) => ({ file, line, rule, fix })),
    ),
  )
}
