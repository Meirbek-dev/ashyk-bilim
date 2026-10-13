// Git hooks and `just fmt`. `.vite-hooks/pre-commit` and `pre-push` call `bun infra/dev/hooks.ts <hook>`.
//
// pre-commit checks the STAGED content only. The index (GIT_INDEX_FILE, so `git commit -- <paths>` works too) is
// written as a tree and checked out into tmp/hooks/snap with an incremental read-tree, node_modules linked in; the
// tools run there. Unstaged work in progress - yours or another agent's - can neither fail nor pass a commit.
//   web-2:  vp fmt + vp lint (type-aware, type-check) of the staged files, cheap gates filtered to staged files
//   web:    vp fmt + vp lint --quiet (type-aware, type-check) of the staged files
//   server: rustfmt --check of the staged .rs files; refuses edits to migrations already on origin/main
// pre-push runs `just check --base <remote tip>` on a checkout of the pushed commit; only CI (env CI) skips it.
import { lstatSync, mkdirSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const MAX_LINES = 30
const WEB2_GATES = ['i18n', 'tokens', 'suppressions', 'trace', 'docs']
const FMT = /\.(ts|tsx|mts|js|mjs|json|jsonc|css|md)$/
const LINT = /\.(ts|tsx|mts|js|mjs)$/
const win = process.platform === 'win32'

type Result = { name: string; code: number; out: string; fix?: string }

function sync(cmd: string[], cwd?: string, env: Record<string, string> = {}): { code: number; out: string } {
  const p = Bun.spawnSync(cmd, { cwd, env: { ...process.env, ...env }, stdout: 'pipe', stderr: 'pipe' })
  return { code: p.exitCode ?? 1, out: `${p.stdout.toString()}${p.stderr.toString()}`.trim() }
}

async function run(name: string, cmd: string[], cwd: string, fix?: string): Promise<Result> {
  const p = Bun.spawn(cmd, {
    cwd,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ])
  // vp prints this note on every built-in command.
  const out = `${stdout}${stderr}`.replace(/^note: You are running `vp .*\n?/gm, '').trim()
  return { name, code, out, ...(fix ? { fix } : {}) }
}

const git = (...args: string[]) => sync(['git', ...args])
const top = git('rev-parse', '--show-toplevel').out
process.chdir(top)

// node_modules/.bin/vp nearest to dir (bun hoists apps/web's to the root on Linux).
function vp(dir: string): string {
  for (let d = dir; ; d = dirname(d)) {
    const bin = join(d, 'node_modules', '.bin', win ? 'vp.exe' : 'vp')
    if (exists(bin)) return bin
    if (dirname(d) === d) return 'vp'
  }
}

function exists(path: string): boolean {
  try {
    lstatSync(path)
    return true
  } catch {
    return false
  }
}

function rustEdition(serverDir: string): string {
  return /^edition\s*=\s*"(\d+)"/m.exec(readFileSync(join(serverDir, 'Cargo.toml'), 'utf8'))?.[1] ?? '2024'
}

function under(files: string[], prefix: string): string[] {
  return files.filter(f => f.startsWith(prefix)).map(f => f.slice(prefix.length))
}

// Migrations on origin/main (else main) are applied somewhere: only new files may be staged.
function migrationEdits(): string[] {
  const base = ['origin/main', 'main'].find(ref => git('rev-parse', '-q', '--verify', `${ref}^{commit}`).code === 0)
  if (!base) return []
  const changed = git(
    'diff',
    '--cached',
    '--no-renames',
    '--diff-filter=MD',
    '--name-only',
    '-z',
    '--',
    'apps/server/migrations',
  )
  return changed.out
    .split('\0')
    .filter(Boolean)
    .filter(path => {
      const applied = git('rev-parse', '-q', '--verify', `${base}:${path}`)
      return applied.code === 0 && git('rev-parse', '-q', '--verify', `:${path}`).out !== applied.out
    })
}

// Check out `tree` into tmp/hooks/<name> with its own index (incremental after the first run, ~0.2 s).
// pre-commit and pre-push use separate dirs; git's index.lock serializes commits within one worktree.
function snapshot(tree: string, name: string): { snap: string; index: string } {
  const hooks = join(top, 'tmp', 'hooks')
  const snap = join(hooks, name)
  const index = join(hooks, `${name}.index`)
  mkdirSync(snap, { recursive: true })
  const read = sync(['git', `--work-tree=${snap}`, 'read-tree', '--reset', '-u', tree], top, { GIT_INDEX_FILE: index })
  if (read.code !== 0) throw new Error(`git read-tree: ${read.out}`)
  for (const dir of ['.', 'apps/web', 'apps/web-2']) {
    const real = join(top, dir, 'node_modules')
    const link = join(snap, dir, 'node_modules')
    if (exists(real) && !exists(link)) symlinkSync(real, link, 'junction') // a symlink off Windows
  }
  // web-2's Paraglide output is gitignored: generate it from the staged catalogs when they changed.
  const messages = git('rev-parse', `${tree}:apps/web-2/messages`).out
  const stamp = join(hooks, `${name}.paraglide`)
  const paraglide = join(snap, 'apps/web-2/src/paraglide')
  if (!exists(paraglide) || !exists(stamp) || readFileSync(stamp, 'utf8') !== messages) {
    const gen = sync(['bun', 'gates/codegen.ts', 'messages'], join(snap, 'apps/web-2'))
    if (gen.code !== 0) throw new Error(`web-2 codegen messages: ${gen.out}`)
    writeFileSync(stamp, messages)
  }
  return { snap, index }
}

function web2(snap: string, files: string[]): Promise<Result>[] {
  const dir = join(snap, 'apps/web-2')
  const fmt = files.filter(f => FMT.test(f))
  const lint = files.filter(f => LINT.test(f))
  const jobs: Promise<Result>[] = []
  const fixFmt = `just fmt ${fmt.map(f => `apps/web-2/${f}`).join(' ')}`
  if (fmt.length)
    jobs.push(
      run('web-2 fmt', [vp(dir), 'fmt', '--list-different', '--no-error-on-unmatched-pattern', ...fmt], dir, fixFmt),
    )
  if (lint.length) jobs.push(run('web-2 lint', [vp(dir), 'lint', '--no-error-on-unmatched-pattern', ...lint], dir))
  // Whole-app gates, but only findings in staged files fail the commit (the rest is pre-push's).
  for (const gate of WEB2_GATES)
    jobs.push(
      run(`web-2 gate ${gate}`, ['bun', 'gates/gates.ts', gate], dir).then(r => {
        const mine = r.out
          .split('\n')
          .filter(line => files.some(f => line.startsWith(`${f}:`) || line.startsWith(`${f} `)))
        return { ...r, code: mine.length ? 1 : 0, out: mine.join('\n') }
      }),
    )
  return jobs
}

function web(snap: string, files: string[]): Promise<Result>[] {
  const dir = join(snap, 'apps/web')
  const fmt = files.filter(f => FMT.test(f))
  const lint = files.filter(f => LINT.test(f))
  const jobs: Promise<Result>[] = []
  const fixFmt = `just fmt ${fmt.map(f => `apps/web/${f}`).join(' ')}`
  if (fmt.length)
    jobs.push(
      run('web fmt', [vp(dir), 'fmt', '--list-different', '--no-error-on-unmatched-pattern', ...fmt], dir, fixFmt),
    )
  if (lint.length)
    jobs.push(
      run(
        'web lint',
        [vp(dir), 'lint', '--type-aware', '--type-check', '--quiet', '--no-error-on-unmatched-pattern', ...lint],
        dir,
      ),
    )
  return jobs
}

function server(snap: string, files: string[]): Promise<Result>[] {
  const rs = files.filter(f => f.endsWith('.rs'))
  if (!rs.length) return []
  const dir = join(snap, 'apps/server')
  const fix = `just fmt ${rs.map(f => `apps/server/${f}`).join(' ')}`
  return [run('server rustfmt', ['rustfmt', '--check', '--color', 'never', '--edition', rustEdition(dir), ...rs], dir, fix)]
}

function report(hook: string, results: Result[], started: number): number {
  const failed = results.filter(r => r.code !== 0)
  const log = join(top, 'tmp', 'hooks', `${hook}.log`)
  mkdirSync(dirname(log), { recursive: true })
  writeFileSync(log, results.map(r => `== ${r.name} (exit ${r.code})\n${r.out}\n`).join('\n'))
  const seconds = ((performance.now() - started) / 1000).toFixed(1)
  if (!failed.length) {
    console.log(`${hook}: ok (${results.map(r => r.name).join(', ') || 'nothing to check'}) in ${seconds}s`)
    return 0
  }
  const budget = Math.max(3, Math.floor(MAX_LINES / failed.length))
  for (const r of failed) {
    const lines = r.out.split('\n')
    console.log(`${hook}: ${r.name} failed`)
    console.log(
      lines
        .slice(0, budget)
        .map(l => `  ${l}`)
        .join('\n'),
    )
    if (lines.length > budget) console.log(`  ... ${lines.length - budget} more lines`)
    if (r.fix) console.log(`  fix: ${r.fix}`)
  }
  console.log(`${hook}: ${failed.length} check(s) failed in ${seconds}s; staged content only; full log ${log}`)
  return 1
}

async function preCommit(): Promise<number> {
  const started = performance.now()
  const staged = git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z').out.split('\0').filter(Boolean)
  const results: Result[] = []
  const migrations = migrationEdits()
  if (migrations.length)
    results.push({
      name: 'applied migrations',
      code: 1,
      out: migrations.map(m => `${m} is on origin/main: never edit an applied migration`).join('\n'),
      fix: 'unstage it (git restore --staged <file>) and add a new migration (just server migration <name>)',
    })
  const files = {
    web2: under(staged, 'apps/web-2/'),
    web: under(staged, 'apps/web/'),
    server: under(staged, 'apps/server/'),
  }
  if (files.web2.length || files.web.length || files.server.some(f => f.endsWith('.rs'))) {
    const tree = git('write-tree') // the index being committed (GIT_INDEX_FILE)
    if (tree.code !== 0) throw new Error(`git write-tree: ${tree.out}`)
    const { snap } = snapshot(tree.out, 'snap')
    results.push(
      ...(await Promise.all([...web2(snap, files.web2), ...web(snap, files.web), ...server(snap, files.server)])),
    )
  }
  return report('pre-commit', results, started)
}

// stdin: "<local ref> <local sha> <remote ref> <remote sha>" per pushed ref. `just check --base <remote sha>` runs in
// a checkout of the pushed commit (tmp/hooks/push, git pointed at it), so uncommitted work in the tree is not checked.
async function prePush(): Promise<number> {
  if (process.env['CI']) return 0
  const zero = /^0+$/
  let local = ''
  let base = ''
  for (const line of (await new Response(Bun.stdin.stream()).text()).split('\n')) {
    const [, sha = '', , remote = ''] = line.trim().split(/\s+/)
    if (!sha || zero.test(sha)) continue // a deleted ref
    local = sha
    base =
      !zero.test(remote) && git('cat-file', '-e', `${remote}^{commit}`).code === 0
        ? remote
        : git('merge-base', sha, 'origin/main').out
    break
  }
  if (!local || !base) return 0
  if (git('cat-file', '-e', `${local}:infra/dev/check.ts`).code !== 0) {
    console.log('pre-push: the pushed commit has no infra/dev/check.ts; skipped')
    return 0
  }
  const lock = join(top, 'tmp', 'hooks', 'push.lock')
  mkdirSync(dirname(lock), { recursive: true })
  for (let waited = 0; ; waited += 1) {
    try {
      mkdirSync(lock) // atomic: one push checks at a time in this worktree
      break
    } catch {
      // A check never takes 2 h: the lock is from a killed push.
      if (Date.now() - statSync(lock).mtimeMs > 7_200_000) rmSync(lock, { recursive: true, force: true })
      if (waited % 60 === 0) console.log(`pre-push: waiting for another push's check (${lock})`)
      await Bun.sleep(1000)
    }
  }
  try {
    const { snap, index } = snapshot(`${local}^{tree}`, 'push')
    console.log(`pre-push: just check --base ${base.slice(0, 8)} on ${local.slice(0, 8)} (tmp/hooks/push)`)
    const gitDir = git('rev-parse', '--absolute-git-dir').out
    const env = { ...process.env, GIT_DIR: gitDir, GIT_WORK_TREE: snap, GIT_INDEX_FILE: index }
    const p = Bun.spawn(['bun', 'infra/dev/check.ts', '--base', base], {
      cwd: snap,
      env,
      stdout: 'inherit',
      stderr: 'inherit',
    })
    return await p.exited
  } finally {
    rmSync(lock, { recursive: true, force: true })
  }
}

// `just fmt <files>`: the repo formatter for web files (root vite.config.ts), rustfmt for .rs.
async function fmt(paths: string[]): Promise<number> {
  const rs = paths.filter(p => p.endsWith('.rs'))
  const other = paths.filter(p => !p.endsWith('.rs'))
  const jobs: Promise<Result>[] = []
  if (other.length) jobs.push(run('fmt', [vp(top), 'fmt', '--write', '--no-error-on-unmatched-pattern', ...other], top))
  if (rs.length) jobs.push(run('rustfmt', ['rustfmt', '--edition', rustEdition(join(top, 'apps/server')), ...rs], top))
  const results = await Promise.all(jobs)
  for (const r of results) if (r.out) console.log(r.out.split('\n').slice(-MAX_LINES).join('\n'))
  return results.some(r => r.code !== 0) ? 1 : 0
}

const [command = '', ...args] = process.argv.slice(2)
const commands: Record<string, () => Promise<number>> = {
  'pre-commit': preCommit,
  'pre-push': prePush,
  fmt: () => fmt(args),
}
const handler = commands[command]
if (!handler) {
  console.error(`usage: bun infra/dev/hooks.ts ${Object.keys(commands).join('|')}`)
  process.exit(2)
}
process.exit(await handler())
