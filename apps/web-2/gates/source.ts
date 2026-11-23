// API usage reporting. Stub routes and theme colors are ast-grep rules (rules/web-2: under-construction, tokens-*).

import {
  allowlist,
  type Finding,
  deprecatedOperations,
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
