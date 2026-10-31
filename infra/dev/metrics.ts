#!/usr/bin/env bun
// `just metrics [--json]`: the size of what agents read, build and keep green, measured the same way every time, so a
// cut (docs/REWRITE.md section 2 size expectations) shows up as numbers. Counts tracked files only; generated code
// (OpenAPI clients, route trees, .sqlx) is listed apart from hand-written code.
import { SQL } from 'bun'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { readHits } from './ledger.ts'
import { databaseUrl, devEnv } from './lib.ts'

const root = resolve(import.meta.dir, '../..')
const files = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {
  cwd: root,
  encoding: 'utf8',
})
  .stdout.split('\n')
  .filter(Boolean)
const lines = (match: (f: string) => boolean) =>
  files.filter(match).reduce((n, f) => {
    try {
      return n + readFileSync(resolve(root, f), 'utf8').split('\n').length
    } catch {
      return n
    }
  }, 0)

const generated = (f: string) =>
  /\/(gen|generated)\/|routeTree\.gen\.ts$|\.sqlx\/|openapi\.v2\.json$|\.snap$|bun\.lock$|Cargo\.lock$/.test(f)
const rust = (f: string) => f.startsWith('apps/server/crates/') && f.endsWith('.rs')
const rustTest = (f: string) => rust(f) && (/\/tests\//.test(f) || f.includes('/testkit/') || f.includes('/testdb'))
const ts = (app: string) => (f: string) => f.startsWith(`apps/${app}/`) && /\.(ts|tsx)$/.test(f) && !generated(f)
const tsTest = (f: string) => /\.(test|spec)\.tsx?$|\/e2e\//.test(f)

const openapi = JSON.parse(readFileSync(resolve(root, 'apps/server/openapi.v2.json'), 'utf8')) as {
  paths: Record<string, Record<string, unknown>>
}
const operations = Object.values(openapi.paths).reduce(
  (n, item) => n + Object.keys(item).filter(m => /^(get|put|post|patch|delete)$/.test(m)).length,
  0,
)

async function tables(): Promise<number | string> {
  try {
    const sql = new SQL(databaseUrl(devEnv(), 'ashyq_dev').replace('@localhost:', '@127.0.0.1:'))
    const [row] = await sql`SELECT count(*)::int AS n FROM information_schema.tables
                             WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_sqlx_migrations'`
    await sql.close()
    return row.n
  } catch {
    return 'n/a (dev db down)'
  }
}

const recipes = (path: string) =>
  readFileSync(resolve(root, path), 'utf8')
    .split('\n')
    .filter(l => /^[a-z][\w-]*( [^:=]*)?:( |$)/.test(l) && !l.includes(':=')).length

const metrics: Record<string, number | string> = {
  'server rust, production lines': lines(f => rust(f) && !rustTest(f)),
  'server rust, test lines': lines(rustTest),
  'server migrations': files.filter(f => /^apps\/server\/migrations\/.*\.sql$/.test(f)).length,
  'database tables (ashyq_dev)': await tables(),
  'api operations (openapi)': operations,
  'web (legacy) ts, hand-written lines': lines(f => ts('web')(f) && !tsTest(f)),
  'web (legacy) ts, test lines': lines(f => ts('web')(f) && tsTest(f)),
  'web-2 ts, hand-written lines': lines(f => ts('web-2')(f) && !tsTest(f) && !f.startsWith('apps/web-2/gates/')),
  'web-2 ts, test lines': lines(f => ts('web-2')(f) && tsTest(f)),
  'web-2 gates lines': lines(f => f.startsWith('apps/web-2/gates/') && f.endsWith('.ts')),
  'generated code lines': lines(f => generated(f) && /\.(ts|tsx|json)$/.test(f) && !f.endsWith('.lock')),
  'docs lines (*.md outside skills)': lines(f => f.endsWith('.md') && !/^\.(agents|claude)\//.test(f)),
  'agent guide lines (AGENTS.md)': lines(f => f.endsWith('AGENTS.md') && !/^\.(agents|claude)\//.test(f)),
  'skills lines (.agents/skills)': lines(f => f.startsWith('.agents/skills/')),
  'infra/dev lines': lines(f => f.startsWith('infra/dev/') && f.endsWith('.ts')),
  'just recipes (root + server)': recipes('justfile') + recipes('apps/server/justfile'),
  'ci workflow lines': lines(f => f.startsWith('.github/workflows/')),
  'compose files': files.filter(f => /(^|\/)compose[^/]*\.yaml$/.test(f)).length,
}

// Red gates of the last 30 days (tmp/gates/hits.jsonl): a web-2 gate absent here caught nothing locally.
const hits = readHits(30)
const byGate = new Map<string, number>()
for (const hit of hits) byGate.set(`${hit.source}: ${hit.gate}`, (byGate.get(`${hit.source}: ${hit.gate}`) ?? 0) + 1)
const gatesSource = readFileSync(resolve(root, 'apps/web-2/gates/gates.ts'), 'utf8')
const block = /const GATES[^{]*\{([\s\S]*?)\n\}/.exec(gatesSource)?.[1] ?? ''
const web2Gates = [...block.matchAll(/^ {2}'?([a-z0-9-]+)'?[,:]/gm)].map(m => m[1]!)
const quiet = web2Gates.filter(g => !hits.some(h => h.source === 'web2-gates' && h.gate === g))
const since = hits[0]?.at.slice(0, 10)

if (process.argv.includes('--json'))
  console.log(JSON.stringify({ ...metrics, gateHits: Object.fromEntries(byGate), quietWeb2Gates: quiet }, null, 2))
else {
  for (const [name, value] of Object.entries(metrics)) console.log(`${String(value).padStart(9)}  ${name}`)
  console.log(`\ngate hits, last 30 days${since ? ` (ledger from ${since})` : ' (ledger empty so far)'}:`)
  for (const [gate, count] of [...byGate].sort((a, b) => b[1] - a[1]))
    console.log(`${String(count).padStart(9)}  ${gate}`)
  console.log(`web-2 gates with no hit: ${quiet.join(', ') || 'none'}`)
}
