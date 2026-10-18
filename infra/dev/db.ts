#!/usr/bin/env bun
// `just db <command>`: throwaway databases on the dev Postgres (docs/RUNBOOK.md, "Databases").
//
//   template [--from <db>]  build ashyq_seed: migrated + `ashyq admin seed-e2e` (once; ~1-2 min)
//   fresh <name>            drop <name> and clone it from ashyq_seed (CREATE DATABASE ... TEMPLATE, ~1 s)
//   drop <name>             drop <name>
//   test-reset [--force]    recreate ashyq_test migrated; drop leftover _sqlx_test_* (refuses while tests run)
//   ls                      list databases with their size
//   sql [--slot N | --db NAME] "<sql>" | -f <file>
//                           run SQL (several statements too) on a slot's database (default slot 0; no slot running:
//                           DEV_DB): a header and rows, `|`-separated, json as text; `UPDATE 3` for a write.
//                           Unicode-safe (no psql code page), 127.0.0.1 (localhost costs 2 s per connection here).
//                           Table map and ready queries: docs/agents/DATA.md.
//
// Connection and secrets: infra/env/dev.env + dev.local.env (infra/dev/lib.ts; AB__ZITADEL__PAT, E2E_PASSWORD).
// Zitadel is shared by every database, so the template copies the e2e accounts' rows (`e2e-%`, with their roles)
// from --from (default ashyq_dev) before seeding: seed-e2e then reuses those Zitadel users instead of failing on an
// existing login name. `ashyq` runs through `cargo run` (ASHYQ_BIN=<binary> skips the build). Logs: tmp/db/<command>.log.
import './cargo-target.ts' // first: CARGO_TARGET_DIR for this checkout, before anything reads or spawns cargo
import { SQL } from 'bun'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { databaseUrl, devEnv, readManifest, root } from './lib.ts'

const TEMPLATE = 'ashyq_seed'
const TEST_DB = 'ashyq_test'
const env = devEnv()
const urlFor = (db: string) => databaseUrl(env, db)
const ident = (name: string) => {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) die(`not a database name: ${name} (lowercase, digits, _)`)
  return `"${name}"`
}

function die(message: string): never {
  process.stderr.write(`db: ${message}\n`)
  process.exit(1)
}

async function admin<T>(run: (sql: SQL) => Promise<T>): Promise<T> {
  const sql = new SQL(urlFor('postgres'))
  try {
    return await run(sql)
  } finally {
    await sql.close()
  }
}

async function exists(db: string): Promise<boolean> {
  return admin(async sql => (await sql`SELECT 1 FROM pg_database WHERE datname = ${db}`).length > 0)
}

async function dropDb(db: string): Promise<void> {
  await admin(async sql => {
    // A template database cannot be dropped until it is a plain one again.
    if ((await sql`SELECT 1 FROM pg_database WHERE datname = ${db} AND datistemplate`).length > 0)
      await sql.unsafe(`ALTER DATABASE ${ident(db)} IS_TEMPLATE false`)
    await sql.unsafe(`DROP DATABASE IF EXISTS ${ident(db)} WITH (FORCE)`)
  })
}

/** `ashyq <args>` through cargo (rebuilt when stale) against `db`; output appended to tmp/db/<log>.log. */
function ashyq(db: string, args: string[], log: string, extra: Record<string, string> = {}): void {
  const logPath = resolve(root, `tmp/db/${log}.log`)
  // ASHYQ_BIN: an already built `ashyq` (e.g. the stack's), when the working tree holds someone's unbuildable WIP.
  const bin = process.env['ASHYQ_BIN']
  const [command, argv] = bin ? [bin, args] : ['cargo', ['run', '--locked', '-q', '-p', 'ashyq-server', '--', ...args]]
  const result = spawnSync(command, argv, {
    cwd: resolve(root, 'apps/server'),
    encoding: 'utf8',
    env: {
      ...process.env,
      // The dev stack's settings (storage, Zitadel, …), never apps/server/.env's database.
      ...Object.fromEntries(Object.entries(env).filter(([key]) => key.startsWith('AB__'))),
      SQLX_OFFLINE: process.env.SQLX_OFFLINE ?? 'true',
      NO_COLOR: '1',
      AB__ENVIRONMENT: 'development',
      AB__DATABASE__URL: urlFor(db),
      // seed-e2e needs Redis (sessions, rate limits): a db no slot uses (slots take 4+N).
      AB__REDIS__URL: `redis://:${env['REDIS_PASSWORD']}@127.0.0.1:${env['DEV_REDIS_PORT']}/15`,
      ...extra,
    },
    maxBuffer: 64 * 1024 * 1024,
  })
  writeFileSync(logPath, `$ ashyq ${args.join(' ')} (${db})\n${result.stdout}${result.stderr}\n`, { flag: 'a' })
  if (result.status !== 0) {
    const tail = `${result.stdout}${result.stderr}`.trim().split('\n').slice(-15).join('\n')
    die(`ashyq ${args.join(' ')} failed (full log: ${logPath}):\n${tail}`)
  }
}

function secret(key: string): string {
  const value = process.env[key] ?? env[key]
  if (!value) die(`${key} is not set: put it in infra/env/dev.local.env (\`just stack up\` writes it)`)
  return value
}

async function template(from: string): Promise<void> {
  const started = performance.now()
  const seedEnv = { AB__ZITADEL__PAT: secret('AB__ZITADEL__PAT'), E2E_PASSWORD: secret('E2E_PASSWORD') }
  // Built aside and swapped in at the end: a failed build never leaves a half-seeded ashyq_seed to clone.
  const building = `${TEMPLATE}_build`
  await dropDb(building)
  await admin(sql => sql.unsafe(`CREATE DATABASE ${ident(building)}`))
  ashyq(building, ['migrate'], 'template')
  const copied = (await exists(from)) ? await copyAccounts(from, building) : 0
  ashyq(building, ['admin', 'seed-e2e', '--learners', process.env.E2E_LEARNERS ?? '250'], 'template', seedEnv)
  await dropDb(TEMPLATE)
  await admin(async sql => {
    await sql.unsafe(`ALTER DATABASE ${ident(building)} RENAME TO ${ident(TEMPLATE)}`)
    await sql.unsafe(`ALTER DATABASE ${ident(TEMPLATE)} IS_TEMPLATE true`)
  })
  const seconds = ((performance.now() - started) / 1000).toFixed(0)
  console.log(
    `db: ${TEMPLATE} ready in ${seconds}s (${copied} e2e accounts reused from ${from}); \`just db fresh <name>\``,
  )
}

const cell = (value: unknown): string =>
  value === null || value === undefined
    ? ''
    : value instanceof Date
      ? value.toISOString()
      : typeof value === 'object'
        ? JSON.stringify(value)
        : String(value)

/** `just db sql`: one result set per statement, printed for reading (and for grep). */
async function runSql(args: string[]): Promise<void> {
  let db = ''
  let slot = '0'
  let query = ''
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--db') db = args[++i] ?? die('--db needs a name')
    else if (arg === '--slot') slot = args[++i] ?? die('--slot needs a number')
    else if (arg === '-f') query = readFileSync(args[++i] ?? die('-f needs a file'), 'utf8')
    else query = arg ?? ''
  }
  if (!query.trim()) die('usage: just db sql [--slot N | --db NAME] "<sql>" | -f <file>')
  db ||= readManifest(slot)?.db ?? env['DEV_DB'] ?? 'ashyq_dev'
  // One connection: a script's BEGIN ... ROLLBACK must run on the same session (Bun refuses BEGIN on a pool).
  const sql = new SQL(urlFor(db).replace('@localhost:', '@127.0.0.1:'), { max: 1 })
  try {
    const result = (await sql.unsafe(query)) as unknown as Record<string, unknown>[] & {
      command?: string
      count?: number
    }
    // Several statements: one array per statement.
    const sets = Array.isArray(result[0]) ? (result as unknown as (typeof result)[]) : [result]
    for (const rows of sets) {
      if (rows.length === 0) {
        console.log(rows.command && rows.command !== 'SELECT' ? `${rows.command} ${rows.count ?? 0}` : '(0 rows)')
        continue
      }
      const columns = Object.keys(rows[0] ?? {})
      console.log(columns.join('|'))
      for (const row of rows) console.log(columns.map(column => cell(row[column])).join('|'))
    }
  } catch (error) {
    die(`${db}: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    await sql.close()
  }
}

/** Bun.SQL hands json columns back parsed (an array), older drivers as text: either way, JSON text for a bind. */
const text = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value))

/** The e2e accounts' rows from `from` (and their role slugs), so seed-e2e finds them instead of creating them. */
async function copyAccounts(from: string, into: string): Promise<number> {
  const source = new SQL(urlFor(from))
  const target = new SQL(urlFor(into))
  try {
    const hasUsers = await source`SELECT 1 FROM information_schema.tables WHERE table_name = 'users'`
    if (hasUsers.length === 0) return 0
    const [{ users, roles }] = await source`
      SELECT coalesce(json_agg(u), '[]') AS users,
             (SELECT coalesce(json_agg(json_build_object('username', u2.username, 'slug', r.slug)), '[]')
                FROM users u2 JOIN user_roles ur ON ur.user_id = u2.id JOIN roles r ON r.id = ur.role_id
               WHERE u2.username LIKE 'e2e-%') AS roles
        FROM users u WHERE u.username LIKE 'e2e-%'`
    await target`INSERT INTO users SELECT * FROM json_populate_recordset(null::users, ${text(users)}::text::json)`
    await target`
      INSERT INTO user_roles (user_id, role_id)
      SELECT u.id, r.id FROM json_to_recordset(${text(roles)}::text::json) AS x(username text, slug text)
        JOIN users u ON u.username = x.username JOIN roles r ON r.slug = x.slug
      ON CONFLICT DO NOTHING`
    return Array.isArray(users) ? users.length : (JSON.parse(text(users)) as unknown[]).length
  } finally {
    await source.close()
    await target.close()
  }
}

async function fresh(name: string): Promise<void> {
  if (name === TEMPLATE || name === 'ashyq_dev') die(`refusing to replace ${name}`)
  if (!(await exists(TEMPLATE))) die(`no ${TEMPLATE} yet: run \`just db template\` first`)
  const started = performance.now()
  await dropDb(name)
  await admin(sql => sql.unsafe(`CREATE DATABASE ${ident(name)} TEMPLATE ${ident(TEMPLATE)}`))
  console.log(
    `db: ${name} cloned from ${TEMPLATE} in ${(performance.now() - started).toFixed(0)} ms -> ${urlFor(name)}`,
  )
}

async function testReset(force: boolean): Promise<void> {
  const [busy, leftovers] = await admin(async sql => {
    const names = (rows: { datname: string }[]) => rows.map(r => r.datname)
    return [
      names(
        await sql`SELECT DISTINCT datname FROM pg_stat_activity
                       WHERE datname = ${TEST_DB} OR datname LIKE '\_sqlx\_test\_%'`,
      ),
      names(await sql`SELECT datname FROM pg_database WHERE datname LIKE '\_sqlx\_test\_%'`),
    ]
  })
  // Another session's tests hold these: dropping them would fail its run.
  if (busy.length > 0 && !force) die(`tests are running (${busy.length} busy test databases); wait or pass --force`)
  for (const db of leftovers) await dropDb(db)
  // sqlx::test keeps its bookkeeping in the master database; it is recreated with the schema.
  await dropDb(TEST_DB)
  await admin(sql => sql.unsafe(`CREATE DATABASE ${ident(TEST_DB)}`))
  ashyq(TEST_DB, ['migrate'], 'test-reset')
  console.log(`db: ${TEST_DB} recreated and migrated; ${leftovers.length} leftover _sqlx_test_* dropped`)
}

async function list(): Promise<void> {
  const rows = await admin(
    sql => sql`SELECT datname, pg_size_pretty(pg_database_size(datname)) AS size, datistemplate
                 FROM pg_database WHERE datname NOT IN ('template0', 'template1') ORDER BY datname`,
  )
  for (const r of rows)
    console.log(`${r.datname.padEnd(40)} ${r.size.padStart(8)}${r.datistemplate ? '  template' : ''}`)
}

mkdirSync(resolve(root, 'tmp/db'), { recursive: true })
const [command, arg, value] = process.argv.slice(2)
switch (command) {
  case 'template':
    await template(arg === '--from' && value ? value : 'ashyq_dev')
    break
  case 'fresh':
    await fresh(arg ?? die('usage: just db fresh <name>'))
    break
  case 'drop':
    if (arg === TEMPLATE || arg === 'ashyq_dev') die(`refusing to drop ${arg}`)
    await dropDb(arg ?? die('usage: just db drop <name>'))
    console.log(`db: ${arg} dropped`)
    break
  case 'test-reset':
    await testReset(arg === '--force')
    break
  case 'ls':
    await list()
    break
  case 'sql':
    await runSql(process.argv.slice(3))
    break
  default:
    die('usage: just db template [--from <db>] | fresh <name> | drop <name> | test-reset | ls | sql [--slot N] "<sql>"')
}
