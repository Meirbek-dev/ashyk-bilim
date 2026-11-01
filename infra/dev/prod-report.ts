#!/usr/bin/env bun
// `just prod-report [--since 24h] [--project cs-mooc]`: what production on this host got wrong lately, so work starts
// from real failures instead of a QA sweep. Read-only: `docker inspect`, `docker logs` and SELECTs on jobs and
// schema_skipped_checks.
//
//   containers  state, health, restarts of the compose project
//   server      WARN/ERROR per message (server and worker JSON logs), most frequent first
//   nginx       5xx per method and route (ids and query strings folded), share of all requests
//   jobs        failed/dead jobs per kind with the last error
//   checks      CHECK constraints a migration skipped because old rows violate them (RUNBOOK 2.4)
//
// User ids, emails, IPs and tokens are redacted; each section prints at most 15 rows.
import { spawnSync } from 'node:child_process'

const args = process.argv.slice(2)
const option = (name: string, fallback: string) => {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback
}
const since = option('--since', '24h')
const project = option('--project', process.env['PROD_PROJECT'] ?? 'cs-mooc')
const ROWS = 15

function docker(...argv: string[]): { code: number; out: string } {
  const p = spawnSync('docker', argv, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 })
  return { code: p.status ?? 1, out: `${p.stdout ?? ''}${p.stderr ?? ''}` }
}

export function redact(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, ':email')
    .replace(/\b\d{1,3}(\.\d{1,3}){3}\b/g, ':ip')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, ':token')
}

/** `/api/v2/courses/<uuid>/x?y=1` -> `/api/v2/courses/:id/x`; static assets fold into one row per directory. */
export function route(uri: string): string {
  const path = redact(uri.split('?')[0] ?? '').replace(/\/\d+(?=\/|$)/g, '/:n')
  return /\.(js|css|png|svg|woff2?|ico|jpg|webp)$/.test(path) ? `${path.replace(/\/[^/]+$/, '')}/*` : path
}

const table = (rows: [string, number, string][]) =>
  rows
    .sort((a, b) => b[1] - a[1])
    .slice(0, ROWS)
    .map(([key, count, extra]) => `  ${String(count).padStart(6)}  ${key}${extra ? `  (${extra})` : ''}`)

function containers(): string[] {
  const names = docker('ps', '-a', '--filter', `label=com.docker.compose.project=${project}`, '--format', '{{.Names}}')
  if (names.code !== 0) throw new Error(`docker ps: ${names.out.trim()}`)
  return names.out.split('\n').filter(Boolean).sort()
}

function state(names: string[]): string[] {
  const out = docker(
    'inspect',
    '-f',
    '{{.Name}}|{{.State.Status}}|{{if .State.Health}}{{.State.Health.Status}}{{end}}|{{.RestartCount}}|{{.State.StartedAt}}|{{.State.ExitCode}}',
    ...names,
  )
  return out.out
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [name = '', status, health, restarts, started, exit] = line.split('|')
      // One-off init jobs (`*-init`) are done when they exited 0.
      const done = /-init-\d+$/.test(name) && status === 'exited' && exit === '0'
      const bad = !done && (status !== 'running' || (health && health !== 'healthy') || restarts !== '0')
      return `  ${bad ? '!!' : 'ok'}  ${name.replace(/^\//, '').padEnd(28)} ${status}${health ? `/${health}` : ''}${status === 'exited' ? ` ${exit}` : ''}  restarts ${restarts}  since ${started?.slice(0, 16)}`
    })
}

function serverLog(names: string[]): string[] {
  const rows = new Map<string, [string, number, string]>()
  for (const name of names.filter(n => /-(server|worker)-\d+$/.test(n))) {
    for (const line of docker('logs', '--since', since, name).out.split('\n')) {
      if (!line.startsWith('{')) continue
      let entry: { level?: string; timestamp?: string; target?: string; fields?: Record<string, unknown> }
      try {
        entry = JSON.parse(line)
      } catch {
        continue
      }
      if (entry.level !== 'WARN' && entry.level !== 'ERROR') continue
      const fields = entry.fields ?? {}
      const err = typeof fields['err'] === 'string' ? ` - ${redact(fields['err']).slice(0, 140)}` : ''
      const key = `${entry.level} ${entry.target ?? ''}: ${redact(String(fields['message'] ?? ''))}${err}`
      const row = rows.get(key) ?? [key, 0, '']
      row[1] += 1
      row[2] = `last ${entry.timestamp?.slice(0, 16) ?? '?'}`
      rows.set(key, row)
    }
  }
  return rows.size ? table([...rows.values()]) : ['  none']
}

function nginx(names: string[]): string[] {
  const name = names.find(n => /-nginx-\d+$/.test(n))
  if (!name) return ['  no nginx container']
  const rows = new Map<string, [string, number, string]>()
  let total = 0
  let failed = 0
  for (const line of docker('logs', '--since', since, name).out.split('\n')) {
    if (!line.startsWith('{')) continue
    let entry: { status?: number | string; method?: string; uri?: string }
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    total += 1
    if (Number(entry.status) < 500) continue
    failed += 1
    const key = `${entry.status} ${entry.method} ${route(entry.uri ?? '')}`
    const row = rows.get(key) ?? [key, 0, '']
    row[1] += 1
    rows.set(key, row)
  }
  const share = total ? ((failed / total) * 100).toFixed(2) : '0'
  return [`  ${failed} of ${total} requests answered 5xx (${share} %)`, ...table([...rows.values()])]
}

function psql(names: string[], sql: string): { rows: string[] } | { error: string } {
  const db = names.find(n => /-db-\d+$/.test(n))
  if (!db) return { error: '  no db container' }
  const out = docker('exec', db, 'sh', '-c', `psql -U "$POSTGRES_USER" -d ashyq -AtF'|' -v ON_ERROR_STOP=1 -c "${sql}"`)
  if (out.code !== 0) return { error: `  query failed: ${out.out.trim().slice(0, 300)}` }
  return { rows: out.out.split('\n').filter(Boolean) }
}

function jobs(names: string[]): string[] {
  const interval = since
    .replace(/^(\d+)h$/, '$1 hours')
    .replace(/^(\d+)m$/, '$1 minutes')
    .replace(/^(\d+)d$/, '$1 days')
  if (!/^\d+ (hours|minutes|days)$/.test(interval)) return [`  --since ${since}: use <n>h, <n>m or <n>d for jobs`]
  const sql = `SELECT status, kind, count(*), max(updated_at)::text, left(max(last_error), 300)
                 FROM jobs WHERE status IN ('failed', 'dead') AND updated_at > now() - interval '${interval}'
                GROUP BY 1, 2 ORDER BY 3 DESC LIMIT ${ROWS}`
  const out = psql(names, sql)
  if ('error' in out) return [out.error]
  const rows = out.rows
  return rows.length
    ? rows.map(r => {
        const [status, kind, count, last, error] = r.split('|')
        return `  ${count?.padStart(6)}  ${status} ${kind}  (last ${last?.slice(0, 16)})${error ? ` - ${redact(error).slice(0, 160)}` : ''}`
      })
    : ['  none']
}

// A skipped check means the schema guarantees less than its migrations say: repair the rows, re-add it.
function checks(names: string[]): string[] {
  const out = psql(
    names,
    `SELECT name, table_name, skipped_at::date FROM schema_skipped_checks ORDER BY name LIMIT ${ROWS}`,
  )
  if ('error' in out) return [out.error]
  return out.rows.length
    ? out.rows.map(r => {
        const [name, table, at] = r.split('|')
        return `  ${name} on ${table} (skipped ${at})`
      })
    : ['  none']
}

if (import.meta.main) {
  const names = containers()
  if (!names.length) {
    console.error(`prod-report: no containers of compose project ${project} here (run it on the production host)`)
    process.exit(1)
  }
  for (const [title, lines] of [
    [`containers (${project})`, state(names)],
    [`server and worker warnings/errors, last ${since}`, serverLog(names)],
    [`nginx 5xx, last ${since}`, nginx(names)],
    [`failed/dead jobs, last ${since}`, jobs(names)],
    ['skipped schema checks', checks(names)],
  ] as const)
    console.log(`${title}\n${lines.join('\n')}\n`)
}
