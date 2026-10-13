// Keeps one slot's processes running (`just stack up` starts it detached; docs/RUNBOOK.md "Dev stack").
// Reads tmp/stack/<slot>/services.json, restarts a crashed process with backoff (1 s doubling to 60 s, reset after a
// minute of uptime), writes tmp/stack/<slot>.json (pids) and logs to tmp/stack/<slot>/supervisor.log.
// Control files in tmp/stack/<slot>/control/: `restart-<service>` (immediate restart), `stop` (stop all, exit).
import { type ChildProcess, spawn } from 'node:child_process'
import {
  appendFileSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeSync,
} from 'node:fs'
import { join } from 'node:path'

import { type Manifest, type ServiceSpec, isWindows, killTree, manifestPath, slotDir, writeJson } from './lib.ts'

const slot = process.argv[2] ?? '0'
const dir = slotDir(slot)
const config = JSON.parse(readFileSync(join(dir, 'services.json'), 'utf8')) as Omit<
  Manifest,
  'supervisor' | 'services'
> & { services: ServiceSpec[] }
const control = join(dir, 'control')
mkdirSync(control, { recursive: true })

const log = (message: string) => appendFileSync(join(dir, 'supervisor.log'), `${new Date().toISOString()} ${message}\n`)

interface Running {
  spec: ServiceSpec
  child?: ChildProcess
  since: number
  restarts: number
  backoff: number
  timer?: ReturnType<typeof setTimeout>
  now?: boolean
}
const services = new Map<string, Running>(
  config.services.map(spec => [spec.name, { spec, since: 0, restarts: 0, backoff: 0 }]),
)
let stopping = false

function writeManifest(): void {
  const manifest: Manifest = {
    ...config,
    supervisor: process.pid,
    services: Object.fromEntries(
      [...services.values()].map(s => [
        s.spec.name,
        {
          pid: s.child?.pid ?? 0,
          log: s.spec.log,
          ...(s.spec.health ? { health: s.spec.health } : {}),
          restarts: s.restarts,
          since: new Date(s.since).toISOString(),
        },
      ]),
    ),
  }
  writeJson(manifestPath(slot), manifest)
}

function start(s: Running): void {
  s.timer = undefined
  if (stopping) return
  const { spec } = s
  if (spec.copyFrom) {
    try {
      copyFileSync(spec.copyFrom, spec.command)
    } catch (error) {
      log(`${spec.name}: cannot copy ${spec.copyFrom}: ${String(error)}`)
    }
  }
  const fd = openSync(spec.log, 'a')
  writeSync(fd, `\n=== ${new Date().toISOString()} supervisor: start ${spec.name}\n`)
  const child = spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    env: { ...process.env, ...spec.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    stdio: ['ignore', fd, fd],
    // Own process group off Windows, so a stop kills the whole tree (taskkill /T does that on Windows).
    detached: !isWindows,
    windowsHide: true,
  })
  closeSync(fd)
  s.child = child
  s.since = Date.now()
  child.on('error', error => log(`${spec.name}: ${String(error)}`))
  child.on('exit', code => s.child === child && exited(s, code))
  writeManifest()
}

function exited(s: Running, code: number | null): void {
  s.child = undefined
  writeManifest()
  if (stopping) return
  if (s.now) {
    s.now = false
    log(`${s.spec.name}: restarted on request`)
    start(s)
    return
  }
  const ran = Date.now() - s.since
  s.backoff = ran > 60_000 ? 1000 : Math.min(Math.max(s.backoff * 2, 1000), 60_000)
  s.restarts++
  log(
    `${s.spec.name}: exited (code ${code}) after ${Math.round(ran / 1000)} s; restart #${s.restarts} in ${s.backoff / 1000} s`,
  )
  s.timer = setTimeout(() => start(s), s.backoff)
}

function shutdown(reason: string): void {
  if (stopping) return
  stopping = true
  log(`stopping (${reason})`)
  for (const s of services.values()) {
    if (s.timer) clearTimeout(s.timer)
    if (s.child?.pid) killTree(s.child.pid)
  }
  const deadline = Date.now() + 15_000
  const wait = setInterval(() => {
    if ([...services.values()].some(s => s.child) && Date.now() < deadline) return
    clearInterval(wait)
    rmSync(manifestPath(slot), { force: true })
    rmSync(control, { recursive: true, force: true })
    log('stopped')
    process.exit(0)
  }, 200)
}

setInterval(() => {
  for (const name of existsSync(control) ? readdirSync(control) : []) {
    rmSync(join(control, name), { force: true })
    if (name === 'stop') shutdown('stop requested')
    const s = services.get(name.replace(/^restart-/, ''))
    if (!s || !name.startsWith('restart-')) continue
    if (s.child?.pid) {
      s.now = true
      killTree(s.child.pid)
    } else {
      if (s.timer) clearTimeout(s.timer)
      start(s)
    }
  }
}, 500)

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => shutdown(signal))
log(`supervisor ${process.pid} for slot ${slot}: ${[...services.keys()].join(', ')}`)
for (const s of services.values()) start(s)
