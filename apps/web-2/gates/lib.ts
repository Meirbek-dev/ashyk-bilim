import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import * as v from 'valibot'

export const appDir = resolve(import.meta.dirname, '..')
export const repoDir = resolve(appDir, '../..')

/** One gate error, printed as `file:line rule - what to do` (spec 8.4). */
export type Finding = { file: string; line?: number; rule: string; fix: string }

export const read = (path: string): string => readFileSync(resolve(appDir, path), 'utf8')

/** Files under `dir` (relative to apps/web-2) whose path matches `include`, generated code skipped. */
export function walk(dir: string, include: RegExp): string[] {
  const skip = /(^|\/)(node_modules|dist|paraglide|gen|gen\.check-tmp)(\/|$)|routeTree\.gen\.ts$/
  const found: string[] = []
  const visit = (absolute: string) => {
    for (const entry of readdirSync(absolute, { withFileTypes: true })) {
      const path = join(absolute, entry.name)
      const rel = relative(appDir, path).replaceAll('\\', '/')
      if (skip.test(rel)) continue
      if (entry.isDirectory()) visit(path)
      else if (include.test(rel)) found.push(rel)
    }
  }
  visit(resolve(appDir, dir))
  return found.toSorted()
}

/** Every regex match in a file, with its 1-based line. */
export function matches(text: string, pattern: RegExp): { line: number; text: string }[] {
  const found: { line: number; text: string }[] = []
  for (const match of text.matchAll(new RegExp(pattern.source, `${pattern.flags.replace('g', '')}g`))) {
    found.push({ line: text.slice(0, match.index).split('\n').length, text: match[0] })
  }
  return found
}

const Reasoned = v.object({ reason: v.pipe(v.string(), v.minLength(10)) })
const Allowlist = v.object({
  apiCoverage: v.object({
    ...Reasoned.entries,
    phase: v.number(),
    enforceFromPhase: v.number(),
    serviceOperations: v.array(v.object({ ...Reasoned.entries, operation: v.string() })),
  }),
  underConstruction: v.object({ ...Reasoned.entries, phase: v.number(), enforceFromPhase: v.number() }),
  contractReportOnly: v.optional(Reasoned),
  suppressions: v.array(v.object({ ...Reasoned.entries, file: v.string(), rule: v.string() })),
  i18nSameAsRu: v.array(v.object({ ...Reasoned.entries, key: v.string() })),
})

/** gates/allowlist.json, validated: an exception without a reason is itself an error. */
export const allowlist = () => v.parse(Allowlist, JSON.parse(read('gates/allowlist.json')))

const ServerRemovals = v.object({
  operations: v.array(v.object({ ...Reasoned.entries, operation: v.string() })),
})

/** gates/server-removals.json: operations without a web consumer that the server deletes in phase 9 (S-12). */
export const serverRemovals = () => v.parse(ServerRemovals, JSON.parse(read('gates/server-removals.json'))).operations

/** SDK function names in the generated client: the names agents search for. */
export const sdkOperations = (): string[] =>
  matches(read('src/shared/api/gen/sdk.gen.ts'), /^export const (\w+) = </m).map(match =>
    match.text.replace(/^export const /, '').replace(/ = <$/, ''),
  )

/** Operations the contract marks `deprecated: true` (JSDoc `@deprecated`): replaced, never a coverage target. */
export const deprecatedOperations = (): Set<string> =>
  new Set(
    [...read('src/shared/api/gen/sdk.gen.ts').matchAll(/@deprecated\s*\*\/\s*export const (\w+) = </g)].map(
      match => match[1] ?? '',
    ),
  )

/** True when `source` calls the operation directly or through its generated Query helpers. */
export const usesOperation = (source: string, operation: string): boolean =>
  new RegExp(`\\b${operation}(Options|InfiniteOptions|Mutation)?\\b`).test(source)
