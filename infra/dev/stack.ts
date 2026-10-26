// `just stack <up|down|status|logs|restart> [slot]` and `just login-as <user> [slot]` (docs/RUNBOOK.md "Dev stack").
// One slot = API + worker + web-2 dev + legacy web dev on ports base + 10*slot, kept alive by supervisor.ts, against
// the shared dev containers (`just dev-up`). Logs and the manifest: tmp/stack/<slot>/, tmp/stack/<slot>.json.
import './cargo-target.ts' // first: CARGO_TARGET_DIR for this checkout, before anything reads or spawns cargo
import { createHash, createHmac } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { join } from 'node:path'

import {
  type ServiceSpec,
  alive,
  databaseUrl,
  devLogin,
  devEnv,
  exe,
  httpUp,
  killTree,
  localEnvFile,
  manifestPath,
  manifests,
  readManifest,
  root,
  run,
  serverEnv,
  setLocalEnv,
  slotDir,
  slotPorts,
  tail,
  tcpOpen,
  waitFor,
  webOrigins,
  writeJson,
} from './lib.ts'

const SERVICES = ['api', 'worker', 'web2', 'web'] as const
const just = process.env['JUST_EXECUTABLE'] ?? 'just'

// --- secrets -------------------------------------------------------------------------------------------------------

/** dev.local.env gets the Zitadel PAT (`just dev-up` writes tmp/dev/zitadel-pat.txt) and a seed password. */
export function ensureLocalEnv(): Record<string, string> {
  let env = devEnv()
  const pat = join(root, 'tmp/dev/zitadel-pat.txt')
  if (!env['AB__ZITADEL__PAT'] && existsSync(pat)) setLocalEnv('AB__ZITADEL__PAT', readFileSync(pat, 'utf8').trim())
  if (!env['E2E_PASSWORD']) setLocalEnv('E2E_PASSWORD', `E2e-${crypto.randomUUID().slice(0, 13)}-Pw1`)
  env = devEnv()
  if (!env['AB__ZITADEL__PAT']) throw new Error(`no AB__ZITADEL__PAT in ${localEnvFile} (run \`just dev-up\`)`)
  return env
}

// --- containers ----------------------------------------------------------------------------------------------------

async function pgUp(env: Record<string, string>): Promise<boolean> {
  try {
    const sql = new Bun.SQL(databaseUrl(env, 'postgres'), { connectionTimeout: 3 })
    await sql`SELECT 1`
    await sql.close()
    return true
  } catch {
    return false
  }
}

async function containerHealth(env: Record<string, string>) {
  return {
    db: await pgUp(env),
    redis: await tcpOpen(Number(env['DEV_REDIS_PORT'])),
    zitadel: await httpUp(`http://localhost:${env['DEV_ZITADEL_PORT']}/debug/healthz`),
    rustfs: await tcpOpen(Number(env['DEV_RUSTFS_PORT'])),
  }
}

/** Starts the dev containers (`just dev-up`) unless every one already answers; Judge0 on request. */
async function containers(env: Record<string, string>, judge0: boolean): Promise<void> {
  const health = await containerHealth(env)
  const down = Object.entries(health)
    .filter(([, up]) => !up)
    .map(([name]) => name)
  if (down.length > 0) {
    say(`containers down (${down.join(', ')}): just dev-up`)
    run([just, 'dev-up'], { log: join(root, 'tmp/stack/containers.log') })
    await waitFor('containers', async () => Object.values(await containerHealth(env)).every(Boolean), 180)
  }
  const judge0Url = `${env['AB__JUDGE0__BASE_URL']}/languages`
  if (judge0 && !(await httpUp(judge0Url))) {
    say('judge0: just dev-judge0 (first start takes a few minutes)')
    run([just, 'dev-judge0'], { log: join(root, 'tmp/stack/judge0.log') })
  }
}

// --- database ------------------------------------------------------------------------------------------------------

/** Creates `db` when missing (from the ashyq_seed template when it exists); true when it was created. */
export async function ensureDatabase(env: Record<string, string>, db: string): Promise<boolean> {
  if (!/^[a-z_][a-z0-9_]*$/.test(db)) throw new Error(`database name '${db}': lowercase letters, digits, _`)
  const sql = new Bun.SQL(databaseUrl(env, 'postgres'))
  try {
    const exists = await sql`SELECT datname FROM pg_database WHERE datname IN (${db}, 'ashyq_seed')`
    const names = new Set(exists.map((row: { datname: string }) => row.datname))
    if (names.has(db)) return false
    const template = names.has('ashyq_seed') ? ' TEMPLATE ashyq_seed' : ''
    await sql.unsafe(`CREATE DATABASE ${db}${template}`)
    say(`database ${db} created${template ? ' from ashyq_seed' : ''}`)
    return true
  } finally {
    await sql.close()
  }
}

/**
 * A database migrated from a CRLF checkout (Windows before .gitattributes pinned migrations to LF) stores CRLF
 * checksums and `ashyq migrate` refuses the LF files as "modified". Same content: re-stamp the LF checksum.
 */
export async function adoptLfChecksums(env: Record<string, string>, db: string): Promise<number> {
  const dir = join(root, 'apps/server/migrations')
  const sql = new Bun.SQL(databaseUrl(env, db))
  let fixed = 0
  try {
    const [table] = await sql`SELECT to_regclass('_sqlx_migrations') AS t`
    if (!table?.t) return 0
    for (const name of readdirSync(dir).filter(n => n.endsWith('.sql'))) {
      const lf = readFileSync(join(dir, name)).toString('latin1').replaceAll('\r\n', '\n')
      const hash = (text: string) => createHash('sha384').update(Buffer.from(text, 'latin1')).digest()
      const version = Number(name.split('_')[0])
      const rows = await sql`UPDATE _sqlx_migrations SET checksum = ${hash(lf)}
                              WHERE version = ${version} AND checksum = ${hash(lf.replaceAll('\n', '\r\n'))}`
      fixed += rows.count
    }
  } finally {
    await sql.close()
  }
  if (fixed) say(`${db}: ${fixed} migration checksums from a CRLF checkout re-stamped (same content, LF)`)
  return fixed
}

// --- server binary -------------------------------------------------------------------------------------------------

const targetDir =
  process.env['CARGO_TARGET_DIR'] ??
  (process.platform === 'win32'
    ? join(process.env['LOCALAPPDATA'] ?? '', 'ashyq-bilim/cargo-target')
    : join(root, 'apps/server/target'))
export const builtServer = join(targetDir, `debug/ashyq${exe}`)

export function buildServer(log: string): void {
  say('server: cargo build (debug)')
  run(['cargo', 'build', '--workspace', '--bin', 'ashyq'], {
    cwd: join(root, 'apps/server'),
    env: { SQLX_OFFLINE: 'true', CARGO_BUILD_JOBS: process.env['CARGO_BUILD_JOBS'] ?? '4' },
    log,
  })
}

/** Runs `ashyq <args>` once from a private copy of the build (the build itself stays writable). */
export function ashyq(slot: string, args: string[], env: Record<string, string>, log: string): void {
  const copy = join(slotDir(slot), `ashyq-cli${exe}`)
  copyFileSync(builtServer, copy)
  run([copy, ...args], { cwd: join(root, 'apps/server'), env, log })
}

// --- storage CORS (S3 PutBucketCors, SigV4) --------------------------------------------------------------------------

const sha256 = (data: string) => createHash('sha256').update(data).digest('hex')
const hmac = (key: string | Buffer, data: string) => createHmac('sha256', key).update(data).digest()

async function putBucketCors(env: Record<string, string>, bucket: string, origins: string[]): Promise<void> {
  const endpoint = new URL(env['AB__STORAGE__ENDPOINT'] ?? '')
  const tags = (name: string, values: string[]) => values.map(v => `<${name}>${v}</${name}>`).join('')
  const body =
    `<CORSConfiguration><CORSRule>${tags('AllowedOrigin', origins)}${tags('AllowedMethod', ['PUT', 'GET', 'HEAD'])}` +
    `<AllowedHeader>*</AllowedHeader><ExposeHeader>ETag</ExposeHeader><MaxAgeSeconds>3000</MaxAgeSeconds>` +
    `</CORSRule></CORSConfiguration>`
  const amzDate = new Date().toISOString().replaceAll(/[-:]/g, '').replace(/\.\d+/, '')
  const day = amzDate.slice(0, 8)
  const headers: Record<string, string> = {
    'content-md5': createHash('md5').update(body).digest('base64'),
    host: endpoint.host,
    'x-amz-content-sha256': sha256(body),
    'x-amz-date': amzDate,
  }
  const signed = Object.keys(headers).join(';')
  const canonical = ['PUT', `/${bucket}`, 'cors=', ...Object.entries(headers).map(([k, v]) => `${k}:${v}`), '', signed]
  const scope = `${day}/us-east-1/s3/aws4_request`
  const toSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    scope,
    sha256([...canonical, headers['x-amz-content-sha256']].join('\n')),
  ]
  const key = ['us-east-1', 's3', 'aws4_request'].reduce(
    (k, part) => hmac(k, part),
    hmac(`AWS4${env['AB__STORAGE__SECRET_KEY']}`, day),
  )
  const signature = createHmac('sha256', key).update(toSign.join('\n')).digest('hex')
  const response = await fetch(`${endpoint.origin}/${bucket}?cors`, {
    method: 'PUT',
    body,
    headers: {
      ...headers,
      authorization: `AWS4-HMAC-SHA256 Credential=${env['AB__STORAGE__ACCESS_KEY']}/${scope}, SignedHeaders=${signed}, Signature=${signature}`,
    },
  })
  if (!response.ok) throw new Error(`put-bucket-cors ${bucket}: ${response.status} ${await response.text()}`)
}

/** Bucket CORS = STORAGE_CORS_ORIGINS + the origins of every live slot and e2e run (+ `extra`). */
export async function applyBucketCors(extra: string[] = []): Promise<string[]> {
  const env = devEnv()
  const base = (env['STORAGE_CORS_ORIGINS'] ?? '').split(/[\s,]+/).filter(Boolean)
  const origins = [...new Set([...base, ...manifests().flatMap(m => m.origins), ...extra])].sort()
  for (const bucket of [env['AB__STORAGE__PUBLIC_BUCKET'], env['AB__STORAGE__PRIVATE_BUCKET']]) {
    await putBucketCors(env, bucket ?? '', origins)
  }
  return origins
}

// --- up / down / status ----------------------------------------------------------------------------------------------

interface UpOptions {
  slot: string
  db: string
  judge0: boolean
  without: string[]
  build: boolean
  seed: boolean
}

/** apps/web/tsconfig.slot<N>.json (gitignored): extends tsconfig.json; next adds the slot's type folders to it. */
function slotTsconfig(slot: string): string {
  const name = `tsconfig.slot${slot}.json`
  const path = join(root, 'apps/web', name)
  if (!existsSync(path)) writeFileSync(path, '{ "extends": "./tsconfig.json" }\n')
  return name
}

function services(o: UpOptions, env: Record<string, string>): ServiceSpec[] {
  const ports = slotPorts(Number(o.slot))
  const dir = slotDir(o.slot)
  const origins = webOrigins(ports)
  const server = serverEnv({ ...ports, db: o.db, origins, webUrl: `http://localhost:${ports.web}` })
  const bun = process.execPath
  const all: ServiceSpec[] = [
    ...(['api', 'worker'] as const).map(name => ({
      name,
      command: join(dir, `ashyq-${name}${exe}`),
      copyFrom: builtServer,
      args: [name === 'api' ? 'serve' : 'worker'],
      cwd: join(root, 'apps/server'),
      env: server,
      log: join(dir, `${name}.log`),
      ...(name === 'api' ? { health: `http://127.0.0.1:${ports.api}/api/v2/health` } : {}),
    })),
    {
      name: 'web2',
      command: bun,
      args: ['x', 'vp', 'dev', '--port', String(ports.web2), '--strictPort'],
      cwd: join(root, 'apps/web-2'),
      env: {
        API_PROXY_TARGET: `http://127.0.0.1:${ports.api}`,
        STORAGE_PROXY_TARGET: env['AB__STORAGE__ENDPOINT'] ?? '',
        PUBLIC_ORIGIN: `http://localhost:${ports.web2}`,
        INTERNAL_API_URL: `http://127.0.0.1:${ports.api}`,
      },
      log: join(dir, 'web2.log'),
      health: `http://localhost:${ports.web2}/favicon.ico`,
    },
    {
      name: 'web',
      command: bun,
      args: ['x', 'next', 'dev', '--turbopack', '-H', '127.0.0.1', '-p', String(ports.web)],
      cwd: join(root, 'apps/web'),
      env: {
        NEXT_PUBLIC_API_URL: `http://localhost:${ports.api}/api/v2/`,
        INTERNAL_API_URL: `http://127.0.0.1:${ports.api}/api/v2/`,
        NEXT_PUBLIC_SITE_URL: `http://localhost:${ports.web}/`,
        NEXT_PUBLIC_MEDIA_URL: `http://localhost:${ports.web}/`,
        APP_URL: `http://localhost:${ports.web}`,
        CONTENT_REWRITE_TARGET: `${env['AB__STORAGE__ENDPOINT']}/${env['AB__STORAGE__PUBLIC_BUCKET']}`,
        NEXT_TELEMETRY_DISABLED: '1',
        // One `next dev` per output folder: slots other than 0 build into their own (next.config.ts).
        ...(o.slot === '0' ? {} : { NEXT_DIST_DIR: `.next-slot${o.slot}`, NEXT_TSCONFIG_PATH: slotTsconfig(o.slot) }),
      },
      log: join(dir, 'web.log'),
      health: `http://localhost:${ports.web}/favicon.ico`,
    },
  ]
  return all.filter(s => !o.without.includes(s.name))
}

/**
 * Starts a process that outlives this one. Windows hands every inheritable handle of ours (the caller's stdout pipe
 * included) to a CreateProcess child, so whoever reads our output would wait until the supervisor exits; WMI starts
 * it with none and outside our job object (a tool killing our process tree does not take the stack down).
 */
function launchDetached(command: string[], log: string): void {
  if (process.platform !== 'win32') {
    spawn(command[0] ?? '', command.slice(1), { cwd: root, detached: true, stdio: 'ignore' }).unref()
    return
  }
  const quote = (text: string) => text.replaceAll("'", "''")
  const line = command.map(arg => `"${arg}"`).join(' ')
  const ps = [
    `$startup = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [UInt16]0 }`,
    `$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{`,
    `CommandLine = '${quote(line)}'; CurrentDirectory = '${quote(root)}'; ProcessStartupInformation = $startup }`,
    `if ($r.ReturnValue -ne 0) { throw "Win32_Process.Create: $($r.ReturnValue)" }`,
  ].join('\n')
  run(['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', ps], { log })
}

async function up(o: UpOptions): Promise<void> {
  const running = readManifest(o.slot)
  if (running && alive(running.supervisor)) {
    say(`slot ${o.slot} is already up (just stack down ${o.slot} first to change it)`)
    return status([o.slot])
  }
  const dir = slotDir(o.slot)
  mkdirSync(dir, { recursive: true })
  const ports = slotPorts(Number(o.slot))
  const specs0 = services(o, devEnv())
  for (const spec of specs0) {
    const port = ports[spec.name as 'api' | 'web2' | 'web']
    if (port && (await tcpOpen(port))) throw new Error(`port ${port} (${spec.name}) is taken by another process`)
  }
  const env = ensureLocalEnv()
  await containers(env, o.judge0)
  if (o.build || !existsSync(builtServer)) buildServer(join(dir, 'build.log'))
  const created = await ensureDatabase(env, o.db)
  const cli = serverEnv({ ...ports, db: o.db, origins: [], webUrl: `http://localhost:${ports.web}` })
  await adoptLfChecksums(env, o.db)
  ashyq(o.slot, ['migrate'], cli, join(dir, 'migrate.log'))
  if (o.seed || created) seed(o.slot, o.db)
  const specs = services(o, env)
  const origins = webOrigins(ports)
  writeJson(join(dir, 'services.json'), {
    slot: o.slot,
    db: o.db,
    ports,
    origins,
    logs: dir,
    services: specs,
  })
  launchDetached([process.execPath, join(import.meta.dir, 'supervisor.ts'), o.slot], join(dir, 'launch.log'))
  await waitFor('supervisor', async () => existsSync(manifestPath(o.slot)), 15)
  await applyBucketCors(origins)
  for (const spec of specs.filter(s => s.health)) {
    try {
      await waitFor(spec.name, () => httpUp(spec.health ?? ''), spec.name === 'api' ? 90 : 180)
    } catch (error) {
      say(`${spec.name} did not come up: ${String(error)}\n${tail(spec.log)}`)
    }
  }
  await status([o.slot])
}

/** `ashyq admin seed-e2e` on the slot's database: e2e accounts (password E2E_PASSWORD), course, learner pool. */
function seed(slot: string, db: string): void {
  const env = ensureLocalEnv()
  const learners = env['E2E_LEARNERS'] ?? '250'
  const log = join(slotDir(slot), 'seed.log')
  say(`seed-e2e on ${db} (${learners} pool learners; log ${log})`)
  const ports = slotPorts(Number(slot))
  const cli = serverEnv({ ...ports, db, origins: [], webUrl: `http://localhost:${ports.web}` })
  ashyq(slot, ['admin', 'seed-e2e', '--learners', learners], { ...cli, E2E_PASSWORD: env['E2E_PASSWORD'] ?? '' }, log)
}

async function down(slot: string): Promise<void> {
  const manifest = readManifest(slot)
  if (!manifest || !alive(manifest.supervisor)) return say(`slot ${slot} is not running`)
  mkdirSync(join(slotDir(slot), 'control'), { recursive: true })
  writeFileSync(join(slotDir(slot), 'control/stop'), '')
  try {
    await waitFor('stop', async () => !alive(manifest.supervisor), 30)
  } catch {
    killTree(manifest.supervisor)
    for (const s of Object.values(manifest.services)) killTree(s.pid)
  }
  say(`slot ${slot} stopped`)
}

async function status(slots: string[]): Promise<void> {
  const env = devEnv()
  const health = await containerHealth(env)
  const judge0 = await httpUp(`${env['AB__JUDGE0__BASE_URL']}/languages`)
  say(
    `containers: ${Object.entries({ ...health, judge0 })
      .map(([k, ok]) => `${k} ${ok ? 'up' : 'DOWN'}`)
      .join(', ')}`,
  )
  const list = slots.length > 0 ? slots.map(s => readManifest(s) ?? s) : manifests()
  if (list.length === 0) say('no slot running (just stack up [slot])')
  for (const m of list) {
    if (typeof m === 'string' || !alive(m.supervisor)) {
      say(`slot ${typeof m === 'string' ? m : m.slot}: down`)
      continue
    }
    say(`slot ${m.slot}: db ${m.db}, supervisor ${m.supervisor}, logs ${m.logs}`)
    for (const [name, s] of Object.entries(m.services)) {
      const port = m.ports[name]
      const state = !alive(s.pid) ? 'DOWN' : s.health ? ((await httpUp(s.health)) ? 'up' : 'starting') : 'up'
      const restarts = s.restarts ? `, ${s.restarts} restarts` : ''
      say(`  ${name.padEnd(6)} ${state.padEnd(8)} ${port ? `:${port}` : '     '}  pid ${s.pid}${restarts}`)
    }
  }
}

function logs(service: string, slot: string, lines: number): void {
  const path = join(slotDir(slot), `${service}.log`)
  say(tail(path, lines))
  say(`-- ${path}`)
}

async function restart(service: string, slot: string): Promise<void> {
  const manifest = readManifest(slot)
  if (!manifest || !alive(manifest.supervisor)) throw new Error(`slot ${slot} is not running`)
  const names = service === 'server' ? ['api', 'worker'] : [service]
  for (const name of names) {
    if (!manifest.services[name])
      throw new Error(`no service '${name}' in slot ${slot} (${Object.keys(manifest.services).join(', ')})`)
  }
  if (names.some(n => n === 'api' || n === 'worker')) buildServer(join(slotDir(slot), 'build.log'))
  for (const name of names) writeFileSync(join(slotDir(slot), `control/restart-${name}`), '')
  const before = Object.fromEntries(names.map(n => [n, manifest.services[n]?.pid]))
  await waitFor('restart', async () => names.every(n => (readManifest(slot)?.services[n]?.pid ?? 0) !== before[n]), 30)
  for (const name of names) {
    const health = readManifest(slot)?.services[name]?.health
    if (health) await waitFor(name, () => httpUp(health), 120)
  }
  await status([slot])
}

async function loginAs(user: string, slot: string): Promise<void> {
  const { cookie, username, roles } = await devLogin(user, Number(slot))
  process.stdout.write(`${cookie}
`)
  process.stderr.write(`# ${username} (${roles.join(', ')}) on :${slotPorts(Number(slot)).api}; cookie domain localhost
`)
}

// --- cli -----------------------------------------------------------------------------------------------------------

function say(line: string): void {
  process.stdout.write(`${line}\n`)
}

function parse(argv: string[]) {
  const flags = new Map<string, string>()
  const positional: string[] = []
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? ''
    if (!arg.startsWith('--')) positional.push(arg)
    else if (['--db', '--without', '-n', '--lines'].includes(arg)) flags.set(arg, argv[++i] ?? '')
    else flags.set(arg, 'true')
  }
  return { flags, positional }
}

const USAGE = `usage: just stack up [slot] [--db NAME] [--judge0] [--seed] [--no-build] [--without web,web2]
       just stack down|status|seed [slot]
       just stack logs <api|worker|web2|web|supervisor|build|migrate|seed> [slot] [--lines N]
       just stack restart <api|worker|server|web2|web> [slot]
       just login-as <username|email> [slot]
slot N: api 8000+10N, web-2 3100+10N, legacy web 3200+10N, Redis db 4+N`

async function main(): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)
  const { flags, positional } = parse(rest)
  const slotArg = (value: string | undefined) => {
    if (value === undefined) return '0'
    if (!/^\d$/.test(value)) throw new Error(`slot must be 0-9 (got '${value}')`)
    return value
  }
  switch (command) {
    case 'up':
      return up({
        slot: slotArg(positional[0]),
        db: flags.get('--db') ?? devEnv()['DEV_DB'] ?? 'ashyq_dev',
        judge0: flags.has('--judge0'),
        without: (flags.get('--without') ?? '').split(',').filter(Boolean),
        build: !flags.has('--no-build'),
        seed: flags.has('--seed'),
      })
    case 'down':
      return down(slotArg(positional[0]))
    case 'status':
      return status(positional.map(p => slotArg(p)))
    case 'logs':
      return logs(positional[0] ?? 'api', slotArg(positional[1]), Number(flags.get('--lines') ?? flags.get('-n') ?? 40))
    case 'restart':
      if (!positional[0] || ![...SERVICES, 'server'].includes(positional[0])) throw new Error(USAGE)
      return restart(positional[0], slotArg(positional[1]))
    case 'login-as':
      if (!positional[0]) throw new Error(USAGE)
      return loginAs(positional[0], slotArg(positional[1]))
    case 'seed': {
      const slot = slotArg(positional[0])
      return seed(slot, flags.get('--db') ?? readManifest(slot)?.db ?? 'ashyq_dev')
    }
    case 'cors':
      return say(`bucket CORS: ${(await applyBucketCors()).join(' ')}`)
    default:
      say(USAGE)
  }
}

if (import.meta.main) {
  try {
    await main()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}
