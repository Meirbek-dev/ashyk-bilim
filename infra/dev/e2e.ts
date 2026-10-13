// `just e2e [web2|web] [--slot N] [--keep] [--no-build] [playwright args]`: Playwright against a PRODUCTION build
// (web-2: `vp build` + serve.ts behind e2e/prod-stand.ts; legacy: `next build` + `next start`, beside slot 0's
// `next dev`, which writes .next/dev) and its own API +
// worker on a fresh database cloned from ashyq_seed (infra/dev/db.ts). Builds only when sources changed.
// `just e2e-dev [web2|web] [--slot N] [args]`: Playwright against a running `just stack up` slot's dev servers.
// Ports of a prod run: slot N = API 8005+10N, stand 3105+10N (web-2 serve.ts 3106+10N), legacy 3205+10N.
// Full output: tmp/e2e/<app>-<slot>/ (playwright.log, api.log, build.log); the summary is the log's tail.
import './cargo-target.ts' // first: CARGO_TARGET_DIR for this checkout, before anything reads or spawns cargo
import { type Subprocess } from 'bun'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { applyBucketCors, buildServer, builtServer, ensureLocalEnv } from './stack.ts'
import {
  alive,
  databaseUrl,
  exe,
  httpUp,
  killTree,
  machineEnv,
  mainCheckout,
  manifestPath,
  pipeToLog,
  readManifest,
  root,
  run,
  serverEnv,
  slotDir,
  tail,
  tcpOpen,
  waitFor,
  writeJson,
} from './lib.ts'

type App = 'web2' | 'web'
const children: Subprocess[] = []

function parse(argv: string[]) {
  const o = { dev: false, app: 'web2' as App, slot: '0', keep: false, build: true, args: [] as string[] }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i] ?? ''
    if (arg === '--dev') o.dev = true
    else if (arg === '--keep') o.keep = true
    else if (arg === '--no-build') o.build = false
    else if (arg === '--slot') o.slot = argv[++i] ?? '0'
    else if ((arg === 'web2' || arg === 'web') && o.args.length === 0) o.app = arg
    else o.args.push(arg)
  }
  if (!/^\d$/.test(o.slot)) throw new Error(`--slot must be 0-9 (got ${o.slot})`)
  return o
}

const say = (line: string) => process.stdout.write(`${line}\n`)

function start(name: string, cmd: string[], cwd: string, env: Record<string, string>, dir: string): void {
  const log = join(dir, `${name}.log`)
  writeFileSync(log, '')
  const child = Bun.spawn(cmd, {
    cwd,
    env: { ...process.env, NO_COLOR: '1', ...machineEnv(), ...env },
    stdout: 'pipe',
    stderr: 'pipe',
    windowsHide: true,
  })
  void pipeToLog(child.stdout, log)
  void pipeToLog(child.stderr, log)
  children.push(child)
}

function stopAll(): void {
  for (const child of children) if (alive(child.pid)) killTree(child.pid)
}

/**
 * Pool learners already taken (a file per account). One Zitadel serves every database, so a learner whose password or
 * 2FA a test changed stays changed in every clone: the list is shared by all runs and slots and only grows (once the
 * pool is used up the suites register their own accounts). Reset it only with Zitadel (`just dev-reset`).
 */
function learnersDir(): string {
  const dir = join(mainCheckout, 'tmp/e2e/learners-taken')
  mkdirSync(dir, { recursive: true })
  return dir
}

async function learnerCount(env: Record<string, string>, db: string): Promise<number> {
  const sql = new Bun.SQL(databaseUrl(env, db))
  try {
    const [row] = await sql`SELECT count(*)::int AS n FROM users WHERE username LIKE 'e2e-learner-%'`
    return Number(row?.n ?? 0)
  } finally {
    await sql.close()
  }
}

/** Newest mtime of the files a build reads (tracked + untracked, not ignored), tests and e2e excluded. */
function sourcesMtime(app: string): number {
  const listed = Bun.spawnSync(['git', 'ls-files', '-co', '--exclude-standard', '--', app], { cwd: root })
  return listed.stdout
    .toString()
    .split('\n')
    .filter(f => f && !/\/(e2e|src\/tests)\/|\.test\.tsx?$|routeTree\.gen\.ts$/.test(f))
    .reduce((newest, f) => {
      try {
        return Math.max(newest, statSync(join(root, f)).mtimeMs)
      } catch {
        return newest
      }
    }, 0)
}

/** Runs `build` unless the stamp says the same sources (and `key`) were built already. */
function buildIfChanged(app: string, key: string, output: string, dir: string, build: () => void): void {
  const stamp = join(root, `tmp/e2e/${app.replace('apps/', '')}-build.stamp`)
  const current = `${sourcesMtime(app)} ${key}`
  if (existsSync(output) && existsSync(stamp) && readFileSync(stamp, 'utf8') === current) {
    say(`${app}: build up to date`)
    return
  }
  say(`${app}: production build (log ${join(dir, 'build.log')})`)
  build()
  writeFileSync(stamp, current)
}

/** Fresh database `name` cloned from ashyq_seed (built first when missing) by infra/dev/db.ts. */
function freshDatabase(name: string, env: Record<string, string>, dir: string): void {
  const db = (args: string[], log: string) =>
    run([process.execPath, join(root, 'infra/dev/db.ts'), ...args], {
      env: {
        DATABASE_URL: databaseUrl(env, 'ashyq_dev'),
        AB__ZITADEL__PAT: env['AB__ZITADEL__PAT'] ?? '',
        E2E_PASSWORD: env['E2E_PASSWORD'] ?? '',
      },
      log: join(dir, log),
    })
  const ls = Bun.spawnSync([process.execPath, join(root, 'infra/dev/db.ts'), 'ls'], {
    cwd: root,
    env: { ...process.env, DATABASE_URL: databaseUrl(env, 'ashyq_dev') },
  })
  if (!/^ashyq_seed\s.*template$/m.test(ls.stdout.toString())) {
    say('ashyq_seed missing: just db template (a few minutes, once)')
    db(['template'], 'db-template.log')
  }
  db(['fresh', name], 'db-fresh.log')
}

async function dev(o: ReturnType<typeof parse>, env: Record<string, string>): Promise<number> {
  const m = readManifest(o.slot)
  if (!m || !alive(m.supervisor)) throw new Error(`slot ${o.slot} is not running: just stack up ${o.slot}`)
  const dir = join(root, `tmp/e2e/${o.app}-dev-${o.slot}`)
  mkdirSync(dir, { recursive: true })
  const appEnv =
    o.app === 'web2'
      ? {
          E2E_DEV_URL: `http://127.0.0.1:${m.ports['web2']}`,
          E2E_API_LOG: join(slotDir(o.slot), 'api.log'),
          E2E_LEARNERS: String(await learnerCount(env, m.db)),
          E2E_LEARNERS_DIR: learnersDir(),
        }
      : legacyEnv(`http://localhost:${m.ports['web']}`, m.ports['api'] ?? 0, env)
  return playwright(o, { ...appEnv, E2E_PASSWORD: env['E2E_PASSWORD'] ?? '' }, dir)
}

function legacyEnv(base: string, api: number, env: Record<string, string>): Record<string, string> {
  const password = env['E2E_PASSWORD'] ?? ''
  return {
    E2E_BASE_URL: base,
    E2E_API_URL: `http://127.0.0.1:${api}/api/v2`,
    E2E_ADMIN_EMAIL: 'admin@e2e.test',
    E2E_TEACHER_EMAIL: 'teacher@e2e.test',
    E2E_STUDENT_EMAIL: 'student1@e2e.test',
    E2E_ADMIN_PASSWORD: password,
    E2E_TEACHER_PASSWORD: password,
    E2E_STUDENT_PASSWORD: password,
  }
}

async function playwright(o: ReturnType<typeof parse>, env: Record<string, string>, dir: string): Promise<number> {
  const cwd = join(root, o.app === 'web2' ? 'apps/web-2' : 'apps/web')
  const config = o.app === 'web2' ? ['-c', 'e2e/playwright.config.ts'] : []
  const logPath = join(dir, 'playwright.log')
  say(`playwright (${o.app}${o.dev ? ', dev servers' : ', production build'}): log ${logPath}`)
  writeFileSync(logPath, '')
  const child = Bun.spawn([process.execPath, 'x', 'playwright', 'test', ...config, ...o.args], {
    cwd,
    env: { ...process.env, NO_COLOR: '1', ...machineEnv(), ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  children.push(child)
  const [code] = await Promise.all([child.exited, pipeToLog(child.stdout, logPath), pipeToLog(child.stderr, logPath)])
  say(tail(logPath, 25))
  return code
}

async function prod(o: ReturnType<typeof parse>, env: Record<string, string>): Promise<number> {
  const n = Number(o.slot)
  const ports = { api: 8005 + 10 * n, stand: 3105 + 10 * n, serve: 3106 + 10 * n, web: 3205 + 10 * n }
  const used = o.app === 'web2' ? [ports.api, ports.stand, ports.serve] : [ports.api, ports.web]
  for (const port of used) {
    if (await tcpOpen(port)) throw new Error(`port ${port} is taken (another \`just e2e --slot ${o.slot}\`?)`)
  }
  const dir = join(root, `tmp/e2e/${o.app}-${o.slot}`)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  const db = `e2e_${o.app}_${o.slot}`
  const origin = o.app === 'web2' ? `http://127.0.0.1:${ports.stand}` : `http://localhost:${ports.web}`
  const origins = [...new Set([origin, origin.replace('127.0.0.1', 'localhost')])]
  const manifest = manifestPath(`e2e-${o.app}-${o.slot}`)
  try {
    if (o.build || !existsSync(builtServer)) buildServer(join(dir, 'server-build.log'))
    freshDatabase(db, env, dir)

    const server = {
      ...serverEnv({ api: ports.api, redisDb: 15, db, origins, webUrl: origin }),
      AB__SERVER__WEB_LINKS: o.app === 'web2' ? 'v2' : 'legacy',
    }
    for (const role of ['api', 'worker']) {
      const copy = join(dir, `ashyq-${role}${exe}`)
      await Bun.write(copy, Bun.file(builtServer))
      start(role, [copy, role === 'api' ? 'serve' : 'worker'], join(root, 'apps/server'), server, dir)
    }
    writeJson(manifest, {
      slot: `e2e-${o.app}-${o.slot}`,
      db,
      ports,
      origins,
      supervisor: process.pid,
      services: {},
      logs: dir,
    })
    await applyBucketCors()

    const node = Bun.which('node') ?? 'node'
    let appEnv: Record<string, string>
    if (o.app === 'web2') {
      const app = join(root, 'apps/web-2')
      buildIfChanged('apps/web-2', '', join(app, 'dist/server/server.js'), dir, () =>
        run([process.execPath, 'x', 'vp', 'build'], { cwd: app, log: join(dir, 'build.log') }),
      )
      const web = { PUBLIC_ORIGIN: origin, INTERNAL_API_URL: `http://127.0.0.1:${ports.api}` }
      start('serve', [node, 'serve.ts'], app, { ...web, PORT: String(ports.serve), HOST: '127.0.0.1' }, dir)
      start(
        'stand',
        [node, 'e2e/prod-stand.ts'],
        app,
        {
          PORT: String(ports.stand),
          WEB_PORT: String(ports.serve),
          API_PROXY_TARGET: `http://127.0.0.1:${ports.api}`,
          STORAGE_PROXY_TARGET: env['AB__STORAGE__ENDPOINT'] ?? '',
        },
        dir,
      )
      appEnv = {
        E2E_BASE_URL: origin,
        E2E_API_LOG: join(dir, 'api.log'),
        E2E_LEARNERS: String(await learnerCount(env, db)),
        E2E_LEARNERS_DIR: learnersDir(),
      }
    } else {
      const app = join(root, 'apps/web')
      const web = {
        NEXT_PUBLIC_API_URL: `http://localhost:${ports.api}/api/v2/`,
        INTERNAL_API_URL: `http://127.0.0.1:${ports.api}/api/v2/`,
        NEXT_PUBLIC_SITE_URL: `${origin}/`,
        NEXT_PUBLIC_MEDIA_URL: `${origin}/`,
        APP_URL: origin,
        CONTENT_REWRITE_TARGET: `${env['AB__STORAGE__ENDPOINT']}/${env['AB__STORAGE__PUBLIC_BUCKET']}`,
        NEXT_TELEMETRY_DISABLED: '1',
      }
      // NEXT_PUBLIC_* are baked into the build: the ports are part of the stamp.
      buildIfChanged('apps/web', JSON.stringify(ports), join(app, '.next/BUILD_ID'), dir, () =>
        run([process.execPath, 'x', 'next', 'build'], { cwd: app, env: web, log: join(dir, 'build.log') }),
      )
      start('web', [process.execPath, 'x', 'next', 'start', '-p', String(ports.web)], app, web, dir)
      appEnv = legacyEnv(origin, ports.api, env)
    }
    await waitFor('api', () => httpUp(`http://127.0.0.1:${ports.api}/api/v2/health`), 90)
    await waitFor(o.app, () => httpUp(origin), 120)
    return await playwright(o, { ...appEnv, E2E_PASSWORD: env['E2E_PASSWORD'] ?? '' }, dir)
  } finally {
    stopAll()
    rmSync(manifest, { force: true })
    if (!o.keep) {
      Bun.spawnSync([process.execPath, join(root, 'infra/dev/db.ts'), 'drop', db], {
        cwd: root,
        env: { ...process.env, DATABASE_URL: databaseUrl(env, 'ashyq_dev') },
      })
    }
  }
}

if (import.meta.main) {
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => (stopAll(), process.exit(130)))
  try {
    const o = parse(process.argv.slice(2))
    const env = ensureLocalEnv()
    process.exit(o.dev ? await dev(o, env) : await prod(o, env))
  } catch (error) {
    stopAll()
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exit(1)
  }
}
