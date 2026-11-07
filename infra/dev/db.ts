#!/usr/bin/env bun
// `just db <command>`: throwaway databases on the dev Postgres (docs/RUNBOOK.md, "Databases").
//
//   prod-copy [--into <db>] [--dump <file>]
//                           replace <db> (default ashyq_dev) with the newest production backup dump, migrated, plus
//                           the e2e accounts it had; the replaced one stays as <db>_prev (docs/RUNBOOK.md 5.6).
//   template [--from <db>]  build ashyq_seed: the production copy, migrated + `ashyq admin seed-e2e` (~1-2 min)
//   fresh <name>            drop <name> and clone it from ashyq_seed (CREATE DATABASE ... TEMPLATE, ~1 s)
//   drop <name>             drop <name>
//   test-reset [--force]    recreate ashyq_test migrated; drop leftover test databases and templates
//                           (_ab_test_*, _ab_template_*, _sqlx_test_*; refuses while tests run)
//   ls                      list databases with their size
//   sql [--slot N | --db NAME] [--rw] "<sql>" | -f <file>
//                           run SQL (several statements too) on a slot's database (default slot 0; no slot running:
//                           DEV_DB): a header and rows, `|`-separated, json as text; `UPDATE 3` for a write.
//                           Read-only as ashyq_ro (no emails, secrets, IPs: infra/postgres/roles.sql); `--rw` writes
//                           as the owner. Without ashyq_ro on the cluster (`just dev-up` creates it): the owner in
//                           read-only transactions.
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
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import { type DbRole, copyDatabaseSettings, databaseUrl, devEnv, readManifest, root } from './lib.ts'

const TEMPLATE = 'ashyq_seed'
const TEST_DB = 'ashyq_test'
// Where the production deploy writes its pre-deploy dumps (infra/scripts/deploy.sh); never the live database.
const PROD_DUMPS = process.env['PROD_DUMPS'] ?? join(homedir(), 'cs-mooc/dumps')
const DB_CONTAINER = process.env['DEV_DB_CONTAINER'] ?? 'ashyq-dev-db-1'
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

/** The newest production dump, or null on a machine without production's dumps (then: the empty schema). */
function newestDump(): string | null {
  if (!existsSync(PROD_DUMPS)) return null
  const dumps = readdirSync(PROD_DUMPS)
    .filter(name => name.endsWith('.dump'))
    .map(name => join(PROD_DUMPS, name))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  return dumps[0] ?? null
}

/** A command in the dev Postgres container, as its superuser; `file` goes to stdin (the dump stays on the host). */
function inDbContainer(argv: string[], file?: string): string {
  const stdin = file ? openSync(file, 'r') : 'ignore'
  const result = spawnSync('docker', ['exec', '-i', DB_CONTAINER, ...argv], {
    encoding: 'utf8',
    stdio: [stdin, 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  })
  if (typeof stdin === 'number') closeSync(stdin)
  if (result.status !== 0)
    die(`${argv[0]} failed:\n${`${result.stdout}${result.stderr}`.trim().split('\n').slice(-8).join('\n')}`)
  return result.stdout
}

/**
 * Create `db` from a production dump: every object owned by the dev owner, grants re-applied as on any database.
 * What the worker would act on is cleared: production's queue must not run a second time from here. Mail stays off
 * on its own (no AB__RESEND__* in dev), and Zitadel is the dev one, so people sign in only through dev-login.
 */
async function restoreDump(db: string, dump: string): Promise<void> {
  await dropDb(db)
  // template0: template1 carries the roles' setup, and the dump creates those objects itself.
  await admin(async sql => {
    await sql.unsafe(`CREATE DATABASE ${ident(db)} TEMPLATE template0`)
    await sql.unsafe(
      `ALTER DATABASE ${ident(db)} SET search_path = public, core, learning, ai, analytics, ops, extensions`,
    )
  })
  // Roles only production has (an old owner of a schema) exist for the restore and are folded into the owner.
  const owners = new Set(
    inDbContainer(['pg_restore', '-l'], dump)
      .split('\n')
      .filter(line => !line.startsWith(';'))
      .map(line => line.trim().split(/\s+/).at(-1) ?? '')
      .filter(owner => /^[a-z_][a-z0-9_]*$/.test(owner)),
  )
  const known = await admin(async sql =>
    (await sql`SELECT rolname FROM pg_roles`).map((r: { rolname: string }) => r.rolname),
  )
  const foreign = [...owners].filter(owner => /^cs_|^ashyq/.test(owner) && !known.includes(owner))
  const asSuperuser = (statements: string, db = 'postgres') =>
    inDbContainer(['psql', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-qAtc', statements])
  if (foreign.length > 0) asSuperuser(foreign.map(role => `CREATE ROLE ${ident(role)} NOLOGIN;`).join(' '))
  inDbContainer(['pg_restore', '-U', 'postgres', '-d', db, '--exit-on-error'], dump)
  const sql = `
    ${foreign.map(role => `REASSIGN OWNED BY ${ident(role)} TO ashyq; DROP OWNED BY ${ident(role)};`).join('\n')}
    DELETE FROM ops.jobs WHERE status IN ('queued', 'running');
    SET ROLE ashyq;
    SELECT public.apply_role_grants('ashyq');`
  asSuperuser(sql, db)
  if (foreign.length > 0) asSuperuser(foreign.map(role => `DROP ROLE ${ident(role)};`).join(' '))
}

/** Replace `into` with the production copy, swapped in only once it is restored and migrated. */
async function prodCopy(args: string[]): Promise<void> {
  const started = performance.now()
  const option = (name: string) => {
    const at = args.indexOf(name)
    return at >= 0 ? (args[at + 1] ?? die(`${name} needs a value`)) : null
  }
  const into = option('--into') ?? 'ashyq_dev'
  const dump = option('--dump') ?? newestDump() ?? die(`no dumps in ${PROD_DUMPS} (PROD_DUMPS, or --dump <file>)`)
  const next = `${into}_next`
  const previous = `${into}_prev`
  await restoreDump(next, dump)
  ashyq(next, ['migrate'], 'prod-copy')
  // `just login-as e2e-admin` keeps working: production has no such people, the dev Zitadel does.
  if (await exists(into)) await copyAccounts(into, next)
  if (await exists(into)) await dropDb(previous)
  await admin(async sql => {
    // Slots reconnect by themselves; a connection that returns between the two statements only delays the rename.
    for (let attempt = 0; ; attempt++) {
      try {
        if (attempt === 0 && !(await exists(into))) break
        // A slot's API and worker connect under other roles: only the superuser may end those sessions.
        inDbContainer([
          'psql',
          '-U',
          'postgres',
          '-d',
          'postgres',
          '-qAtc',
          `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${into}'`,
        ])
        await sql.unsafe(`ALTER DATABASE ${ident(into)} RENAME TO ${ident(previous)}`)
        break
      } catch (error) {
        if (attempt >= 10) throw error
        await Bun.sleep(300)
      }
    }
    await sql.unsafe(`ALTER DATABASE ${ident(next)} RENAME TO ${ident(into)}`)
    const stamp = `production copy of ${dump.split('/').at(-1)}, restored ${new Date().toISOString()}`
    await sql.unsafe(`COMMENT ON DATABASE ${ident(into)} IS '${stamp}'`)
  })
  const seconds = ((performance.now() - started) / 1000).toFixed(0)
  console.log(`db: ${into} is now a copy of ${dump} (${seconds}s); the replaced one: ${previous}`)
}

async function template(from: string): Promise<void> {
  const started = performance.now()
  const seedEnv = { AB__ZITADEL__PAT: secret('AB__ZITADEL__PAT'), E2E_PASSWORD: secret('E2E_PASSWORD') }
  // Built aside and swapped in at the end: a failed build never leaves a half-seeded ashyq_seed to clone.
  const building = `${TEMPLATE}_build`
  await dropDb(building)
  // e2e runs on production's data too, where a dump exists (docs/RUNBOOK.md 5.6); its fixtures add their own rows.
  const dump = newestDump()
  if (dump) await restoreDump(building, dump)
  else await admin(sql => sql.unsafe(`CREATE DATABASE ${ident(building)}`))
  ashyq(building, ['migrate'], 'template')
  // The e2e accounts live in the previous template once ashyq_dev is a production copy without them.
  let copied = (await exists(from)) ? await copyAccounts(from, building) : 0
  if (copied === 0 && (await exists(TEMPLATE))) copied = await copyAccounts(TEMPLATE, building)
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

/**
 * One connection (a script's BEGIN ... ROLLBACK must run on the same session; Bun refuses BEGIN on a pool):
 * ashyq_ro unless `rw`; the owner in read-only transactions while the cluster has no ashyq_ro yet.
 */
async function sqlSession(db: string, rw: boolean): Promise<SQL> {
  const open = (role: DbRole) => new SQL(databaseUrl(env, db, role).replace('@localhost:', '@127.0.0.1:'), { max: 1 })
  if (rw) return open('owner')
  if (env['ASHYQ_RO_DB_PASSWORD']) {
    const ro = open('ro')
    try {
      await ro`SELECT 1`
      return ro
    } catch {
      await ro.close()
    }
  }
  process.stderr.write('db: no ashyq_ro login on this cluster (`just dev-up` creates it): owner, read-only\n')
  const owner = open('owner')
  await owner.unsafe('SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY')
  return owner
}

/** `just db sql`: one result set per statement, printed for reading (and for grep). */
async function runSql(args: string[]): Promise<void> {
  let db = ''
  let slot = '0'
  let query = ''
  let rw = false
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--rw') rw = true
    else if (arg === '--db') db = args[++i] ?? die('--db needs a name')
    else if (arg === '--slot') slot = args[++i] ?? die('--slot needs a number')
    else if (arg === '-f') query = readFileSync(args[++i] ?? die('-f needs a file'), 'utf8')
    else query = arg ?? ''
  }
  if (!query.trim()) die('usage: just db sql [--slot N | --db NAME] [--rw] "<sql>" | -f <file>')
  db ||= readManifest(slot)?.db ?? env['DEV_DB'] ?? 'ashyq_dev'
  const sql = await sqlSession(db, rw)
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
  await admin(async sql => {
    await sql.unsafe(`CREATE DATABASE ${ident(name)} TEMPLATE ${ident(TEMPLATE)}`)
    await copyDatabaseSettings(sql, TEMPLATE, name)
  })
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
                       WHERE datname = ${TEST_DB} OR datname LIKE '\_sqlx\_test\_%' OR datname LIKE '\_ab\_%'`,
      ),
      names(
        await sql`SELECT datname FROM pg_database
                   WHERE datname LIKE '\_sqlx\_test\_%' OR datname LIKE '\_ab\_test\_%' OR datname LIKE '\_ab\_template\_%'`,
      ),
    ]
  })
  // Another session's tests hold these: dropping them would fail its run.
  if (busy.length > 0 && !force) die(`tests are running (${busy.length} busy test databases); wait or pass --force`)
  for (const db of leftovers) await dropDb(db)
  // sqlx::test keeps its bookkeeping in the master database; it is recreated with the schema.
  await dropDb(TEST_DB)
  await admin(sql => sql.unsafe(`CREATE DATABASE ${ident(TEST_DB)}`))
  ashyq(TEST_DB, ['migrate'], 'test-reset')
  console.log(
    `db: ${TEST_DB} recreated and migrated; ${leftovers.length} leftover test databases and templates dropped`,
  )
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
  case 'prod-copy':
    await prodCopy(process.argv.slice(3))
    break
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
    die(
      'usage: just db prod-copy [--into <db>] [--dump <file>] | template [--from <db>] | fresh <name> | drop <name> | test-reset | ls | sql [--slot N] [--rw] "<sql>"',
    )
}
