// Shared by the dev-stack scripts (stack.ts, supervisor.ts, e2e.ts): env files, slot ports, manifests.
// Env: infra/env/dev.env (committed) < infra/env/dev.local.env (gitignored: AB__ZITADEL__PAT, E2E_PASSWORD) < the
// per-slot values derived here. Run with bun.
import {
  appendFileSync,
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { connect } from 'node:net'
import { dirname, join, resolve } from 'node:path'

export const root = resolve(import.meta.dir, '../..')
export const stackDir = join(root, 'tmp/stack')
export const localEnvFile = join(root, 'infra/env/dev.local.env')
export const isWindows = process.platform === 'win32'
export const exe = isWindows ? '.exe' : ''

export function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line)
    if (match?.[1]) out[match[1]] = (match[2] ?? '').trim().replace(/^(['"])(.*)\1$/, '$2')
  }
  return out
}

const readEnv = (path: string) => (existsSync(path) ? parseEnv(readFileSync(path, 'utf8')) : {})

/** dev.env + dev.local.env (local wins). */
export function devEnv(): Record<string, string> {
  return { ...readEnv(join(root, 'infra/env/dev.env')), ...readEnv(localEnvFile) }
}

/** Sets `key` in dev.local.env (appends or replaces the line). */
export function setLocalEnv(key: string, value: string): void {
  const lines = existsSync(localEnvFile) ? readFileSync(localEnvFile, 'utf8').split(/\r?\n/).filter(Boolean) : []
  const rest = lines.filter(line => !line.startsWith(`${key}=`))
  if (lines.length === 0) rest.push('# Local secrets for the dev stack (gitignored). See infra/env/dev.env.')
  writeFileSync(localEnvFile, `${[...rest, `${key}=${value}`].join('\n')}\n`)
}

/** Slot N = every app port + 10*N (slot 0 = 8000 / 3100 / 3200). Redis db 4+N. */
export function slotPorts(slot: number) {
  const offset = slot * 10
  return { api: 8000 + offset, web2: 3100 + offset, web: 3200 + offset, redisDb: 4 + slot }
}

export function webOrigins(ports: { web2: number; web: number }): string[] {
  return [ports.web2, ports.web].flatMap(port => [`http://localhost:${port}`, `http://127.0.0.1:${port}`])
}

export function databaseUrl(env: Record<string, string>, db: string): string {
  return `postgres://ashyq:${env['ASHYQ_DB_PASSWORD']}@localhost:${env['DEV_PG_PORT']}/${db}`
}

/** Environment of `ashyq serve` / `worker` / `migrate` / `admin` for one API instance. */
export function serverEnv(opts: { api: number; redisDb: number; db: string; origins: string[]; webUrl: string }) {
  const env = devEnv()
  const own = Object.fromEntries(Object.entries(env).filter(([key]) => key.startsWith('AB__') || key === 'RUST_LOG'))
  return {
    ...own,
    AB__SERVER__PORT: String(opts.api),
    AB__SERVER__CORS_ORIGINS: JSON.stringify(opts.origins),
    AB__SERVER__WEB_URL: opts.webUrl,
    AB__DATABASE__URL: databaseUrl(env, opts.db),
    AB__REDIS__URL: `redis://:${env['REDIS_PASSWORD']}@localhost:${env['DEV_REDIS_PORT']}/${opts.redisDb}`,
    NO_COLOR: '1',
  }
}

export interface ServiceSpec {
  name: string
  command: string
  args: string[]
  cwd: string
  env: Record<string, string>
  log: string
  /** HTTP URL answering 2xx-4xx once the service is up (none: alive = up). */
  health?: string
  /** Copied to `command` before every start (Windows locks a running .exe, so builds never write it). */
  copyFrom?: string
}

export interface Manifest {
  slot: string
  db: string
  ports: Record<string, number>
  origins: string[]
  supervisor: number
  services: Record<string, { pid: number; log: string; health?: string; restarts: number; since: string }>
  logs: string
}

export const manifestPath = (slot: string) => join(stackDir, `${slot}.json`)
export const slotDir = (slot: string) => join(stackDir, slot)

export function readManifest(slot: string): Manifest | undefined {
  try {
    return JSON.parse(readFileSync(manifestPath(slot), 'utf8')) as Manifest
  } catch {
    return undefined
  }
}

export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(`${path}.tmp`, JSON.stringify(value, null, 2))
  // rename over an existing file is atomic on both platforms (readers never see half a manifest).
  renameSync(`${path}.tmp`, path)
}

export function manifests(): Manifest[] {
  if (!existsSync(stackDir)) return []
  return readdirSync(stackDir)
    .filter(name => name.endsWith('.json'))
    .flatMap(name => readManifest(name.slice(0, -5)) ?? [])
    .filter(m => alive(m.supervisor))
}

export function alive(pid: number | undefined): boolean {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** Kills a process and its children (Windows: taskkill /T; elsewhere the child's process group). */
export function killTree(pid: number): void {
  if (!alive(pid)) return
  if (isWindows) Bun.spawnSync(['taskkill', '/PID', String(pid), '/T', '/F'], { stdout: 'ignore', stderr: 'ignore' })
  else {
    try {
      process.kill(-pid, 'SIGTERM')
    } catch {
      process.kill(pid, 'SIGTERM')
    }
  }
}

export function tcpOpen(port: number, host = '127.0.0.1', timeout = 1000): Promise<boolean> {
  return new Promise(done => {
    const socket = connect({ port, host })
    const finish = (ok: boolean) => {
      socket.destroy()
      done(ok)
    }
    socket.setTimeout(timeout, () => finish(false))
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
  })
}

export async function httpUp(url: string, timeout = 3000): Promise<boolean> {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(timeout), redirect: 'manual' })
    await response.body?.cancel()
    return response.status < 500
  } catch {
    return false
  }
}

export async function freePort(): Promise<number> {
  const server = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } })
  const port = server.port
  server.stop(true)
  return port
}

export const sleep = (ms: number) => new Promise(done => setTimeout(done, ms))

export async function waitFor(what: string, check: () => Promise<boolean>, seconds: number): Promise<void> {
  for (const deadline = Date.now() + seconds * 1000; Date.now() < deadline; await sleep(500)) {
    if (await check()) return
  }
  throw new Error(`${what}: not up after ${seconds} s`)
}

/** Last `lines` lines of a log file (for failure summaries). */
export function tail(path: string, lines = 15): string {
  if (!existsSync(path)) return `(no ${path})`
  return readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .slice(-lines - 1)
    .join('\n')
}

export function removeQuietly(path: string): void {
  rmSync(path, { recursive: true, force: true })
}

// CSI and OSC escape sequences: some tools colour their output whatever NO_COLOR says (rolldown, turbopack frames).
// oxlint-disable-next-line no-control-regex
const ANSI = /\u001B(?:\[[0-?]*[ -/]*[@-~]|\][^\u0007\u001B]*(?:\u0007|\u001B\\))/g
export const stripAnsi = (text: string) => text.replace(ANSI, '')

/** Appends a process's output to `log` without escape sequences (logs are read by people, agents and greps). */
export async function pipeToLog(stream: AsyncIterable<Uint8Array | string> | null, log: string): Promise<void> {
  if (!stream) return
  const decoder = new TextDecoder()
  for await (const chunk of stream) {
    appendFileSync(log, stripAnsi(typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })))
  }
}

/** Runs a command to completion with its output in `log`; throws with the log's tail on failure. */
export function run(cmd: string[], opts: { cwd?: string; env?: Record<string, string>; log: string }): void {
  mkdirSync(dirname(opts.log), { recursive: true })
  const fd = openSync(opts.log, 'w')
  try {
    const result = Bun.spawnSync(cmd, {
      cwd: opts.cwd ?? root,
      env: { ...process.env, NO_COLOR: '1', ...opts.env },
      stdout: fd,
      stderr: fd,
    })
    closeSync(fd)
    writeFileSync(opts.log, stripAnsi(readFileSync(opts.log, 'utf8')))
    if (!result.success) throw new Error(`${cmd.join(' ')} failed (log ${opts.log}):\n${tail(opts.log)}`)
  } finally {
    try {
      closeSync(fd)
    } catch {
      // already closed above
    }
  }
}
