// Git hooks and `just fmt`. `.vite-hooks/pre-commit` and `pre-push` call `bun infra/dev/hooks.ts <hook>`.
//
// pre-commit checks the STAGED content only. The index (GIT_INDEX_FILE, so `git commit -- <paths>` works too) is
// written as a tree and checked out into tmp/hooks/snap with an incremental read-tree, node_modules linked in; the
// tools run there. Unstaged work in progress - yours or another agent's - can neither fail nor pass a commit.
//   web-2:  vp fmt + vp lint (type-aware, type-check) of the staged files, cheap gates filtered to staged files
//   web:    vp fmt + vp lint --quiet (type-aware, type-check) of the staged files
//   server: rustfmt --check of the staged .rs files; refuses edits to migrations already on origin/main
// pre-push runs `just check --base <remote tip>` on a checkout of the pushed commit; only CI (env CI) skips it.
import { lstatSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'

import { recordHits } from './ledger.ts'

const MAX_LINES = 30
const WEB2_GATES = ['i18n', 'tokens', 'suppressions', 'trace', 'docs']
const FMT = /\.(ts|tsx|mts|js|mjs|json|jsonc|css|md)$/
const LINT = /\.(ts|tsx|mts|js|mjs)$/
const win = process.platform === 'win32'

type Result = { name: string; code: number; out: string; fix?: string }

function sync(cmd: string[], cwd?: string, env: Record<string, string> = {}): { code: number; out: string } {
  const p = Bun.spawnSync(cmd, {
    cwd,
    env: { ...process.env, PATH: `${dirname(process.execPath)}${delimiter}${process.env['PATH'] ?? ''}`, ...env },
    stdout: 'pipe',
    stderr: 'pipe',
    windowsHide: true,
  })
  return { code: p.exitCode ?? 1, out: `${p.stdout.toString()}${p.stderr.toString()}`.trim() }
}

// Tools never see the hook's GIT_INDEX_FILE & co.: a tool (or test) that runs git elsewhere must not reach this repo.
const toolEnv = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_'))),
  NO_COLOR: '1',
  FORCE_COLOR: '0',
  PATH: `${dirname(process.execPath)}${delimiter}${process.env['PATH'] ?? ''}`,
}

async function run(name: string, cmd: string[], cwd: string, fix?: string): Promise<Result> {
  const p = Bun.spawn(cmd, {
    cwd,
    env: toolEnv,
    stdout: 'pipe',
    stderr: 'pipe',
    windowsHide: true,
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

function readText(path: string): string {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return ''
  }
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return pid > 0
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

// Migrations on origin/main (else main) are applied somewhere: only new files may be committed. `diff`: the git diff
// arguments of the change (`--cached` for the index), `blob`: the object of a path in the new content.
function migrationEdits(diff: string[], blob: (path: string) => string): string[] {
  const base = ['origin/main', 'main'].find(ref => git('rev-parse', '-q', '--verify', `${ref}^{commit}`).code === 0)
  if (!base) return []
  const changed = git(
    'diff',
    ...diff,
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
      return applied.code === 0 && git('rev-parse', '-q', '--verify', blob(path)).out !== applied.out
    })
}

// Check out `tree` into tmp/hooks/snap with its own index (incremental after the first run, ~0.2 s). Commits within
// one worktree are serialized by git's index.lock.
function snapshot(tree: string): string {
  const snap = join(top, 'tmp', 'hooks', 'snap')
  mkdirSync(snap, { recursive: true })
  const index = join(top, 'tmp', 'hooks', 'snap.index')
  const read = sync(['git', `--work-tree=${snap}`, 'read-tree', '--reset', '-u', tree], top, { GIT_INDEX_FILE: index })
  if (read.code !== 0) throw new Error(`git read-tree: ${read.out}`)
  return snap
}

// The pushed commit as a detached linked worktree (tmp/hooks/push): git works there as in any checkout, and no
// GIT_* environment exists that a check (or a test running `git init`) could turn against this repository.
function pushCheckout(sha: string): string {
  const dir = join(top, 'tmp', 'hooks', 'push')
  const cmd = exists(join(dir, '.git'))
    ? ['git', '-C', dir, 'checkout', '--detach', '--force', '--quiet', sha]
    : ['git', 'worktree', 'add', '--detach', '--force', dir, sha]
  const step = Bun.spawnSync(cmd, { cwd: top, env: toolEnv, stdout: 'pipe', stderr: 'pipe', windowsHide: true })
  if (step.exitCode !== 0) throw new Error(`${cmd.join(' ')}: ${step.stderr.toString()}`)
  return dir
}

// node_modules links (junction on Windows, symlink elsewhere) and web-2's gitignored Paraglide output, regenerated
// when the checked-out catalogs changed.
function prepare(dir: string, tree: string, paraglide: boolean): void {
  for (const sub of ['.', 'apps/web', 'apps/web-2']) {
    const real = join(top, sub, 'node_modules')
    const link = join(dir, sub, 'node_modules')
    if (exists(real) && exists(dirname(link)) && !exists(link)) symlinkSync(real, link, 'junction')
  }
  const messages = git('rev-parse', '-q', '--verify', `${tree}:apps/web-2/messages`).out
  // The Vite plugin replaces its generated directory; keep our input stamp outside it.
  const stamp = join(dir, 'tmp/paraglide-hook-stamp')
  const stale = !exists(stamp) || readFileSync(stamp, 'utf8') !== messages
  if (paraglide && messages && stale) {
    const gen = sync(
      ['node', '--import', './gates/ts6-register.mjs', 'gates/codegen.ts', 'messages'],
      join(dir, 'apps/web-2'),
    )
    if (gen.code !== 0) throw new Error(`web-2 codegen messages: ${gen.out}`)
    mkdirSync(dirname(stamp), { recursive: true })
    writeFileSync(stamp, messages)
  }
}

function web2(snap: string, files: string[]): Promise<Result>[] {
  if (!files.length) return []
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
  return [
    run('server rustfmt', ['rustfmt', '--check', '--color', 'never', '--edition', rustEdition(dir), ...rs], dir, fix),
  ]
}

function report(hook: string, results: Result[], started: number): number {
  const failed = results.filter(r => r.code !== 0)
  recordHits(
    hook,
    failed.map(r => ({ gate: r.name })),
    top,
  )
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
  console.log(
    `${hook}: ${failed.length} check(s) failed in ${seconds}s; ${hook === 'pre-commit' ? 'staged content only' : 'the commit only'}; full log ${log}`,
  )
  return 1
}

async function preCommit(): Promise<number> {
  const staged = git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z').out.split('\0').filter(Boolean)
  // The index being committed (GIT_INDEX_FILE), written as a tree only when a check needs a checkout.
  const tree = () => {
    const written = git('write-tree')
    if (written.code !== 0) throw new Error(`git write-tree: ${written.out}`)
    return written.out
  }
  return checkChange(
    'pre-commit',
    staged,
    tree,
    migrationEdits(['--cached'], path => `:${path}`),
  )
}

// The pre-commit checks on a commit already made (jj runs no git hooks): its files against its first parent.
function verifyCommit(sha: string): Promise<number> {
  const parent = git('rev-parse', '-q', '--verify', `${sha}^`).out || git('hash-object', '-t', 'tree', '/dev/null').out
  const files = git('diff', '--name-only', '--diff-filter=ACMR', '-z', parent, sha).out.split('\0').filter(Boolean)
  return checkChange(
    'commit-check',
    files,
    () => sha,
    migrationEdits([parent, sha], path => `${sha}:${path}`),
  )
}

async function checkChange(hook: string, changed: string[], tree: () => string, migrations: string[]): Promise<number> {
  const started = performance.now()
  const results: Result[] = []
  if (migrations.length)
    results.push({
      name: 'applied migrations',
      code: 1,
      out: migrations.map(m => `${m} is on origin/main: never edit an applied migration`).join('\n'),
      fix: 'take the edit out of this commit and add a new migration (just server migration <name>)',
    })
  const files = {
    web2: under(changed, 'apps/web-2/'),
    web: under(changed, 'apps/web/'),
    server: under(changed, 'apps/server/'),
  }
  if (files.web2.length || files.web.length || files.server.some(f => f.endsWith('.rs'))) {
    const treeish = tree()
    const snap = snapshot(treeish)
    prepare(snap, treeish, files.web2.length > 0)
    results.push(
      ...(await Promise.all([...web2(snap, files.web2), ...web(snap, files.web), ...server(snap, files.server)])),
    )
  }
  return report(hook, results, started)
}

const jj = () => exists(join(top, '.jj')) && sync(['jj', '--version']).code === 0

// `just commit -m "msg" [jj filesets | git paths]`. git runs its own hook. jj runs none: `jj commit`, then the
// pre-commit checks on the new commit; a failure restores the operation before it (`jj op restore`), leaving the
// changes in the working copy. Not `jj undo`: the checks' files can add a snapshot operation that undo would take.
async function commit(args: string[]): Promise<number> {
  const tool = jj() ? 'jj' : 'git'
  // `jj status` snapshots the working copy first, so the recorded operation holds the changes being committed.
  const before =
    tool === 'jj' && sync(['jj', 'status'], top).code === 0
      ? sync(['jj', 'op', 'log', '-n', '1', '--no-graph', '-T', 'id', '--ignore-working-copy'], top).out
      : ''
  const made = Bun.spawnSync([tool, 'commit', ...args], { cwd: top, stdio: ['inherit', 'inherit', 'inherit'] })
  if (made.exitCode !== 0 || tool === 'git') return made.exitCode ?? 1
  const sha = sync(['jj', 'log', '-r', '@-', '--no-graph', '-T', 'commit_id', '--ignore-working-copy'], top).out
  const code = await verifyCommit(sha)
  if (code !== 0) {
    const restored = before ? sync(['jj', 'op', 'restore', before], top) : { code: 1, out: 'no operation recorded' }
    console.log(
      restored.code === 0
        ? 'commit: undone (jj op restore); the changes are back in the working copy. Fix the findings, then commit again.'
        : `commit: the checks failed and the commit could not be undone (${restored.out}); \`jj op log\`, then \`jj op restore <id>\``,
    )
  }
  return code
}

// `just push [bookmark]` (default main). git push runs the pre-push hook; `jj git push` would skip it. Under jj the
// bookmark first moves forward to @- (the last commit; jj refuses a backwards or sideways move).
function push(args: string[]): number {
  const bookmark = args[0] ?? 'main'
  if (jj()) {
    const moved = Bun.spawnSync(['jj', 'bookmark', 'move', bookmark, '--to', '@-'], {
      cwd: top,
      stdio: ['inherit', 'inherit', 'inherit'],
    })
    if (moved.exitCode !== 0) return moved.exitCode ?? 1
  }
  return (
    Bun.spawnSync(['git', 'push', 'origin', bookmark], { cwd: top, stdio: ['inherit', 'inherit', 'inherit'] })
      .exitCode ?? 1
  )
}

// stdin: "<local ref> <local sha> <remote ref> <remote sha>" per pushed ref. `just check --base <remote sha>` runs in
// a detached worktree of the pushed commit (tmp/hooks/push), so uncommitted work in this tree is not checked.
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
      writeFileSync(lock, String(process.pid), { flag: 'wx' }) // atomic: one push checks at a time per worktree
      break
    } catch {
      if (!alive(Number(readText(lock)))) rmSync(lock, { force: true }) // left by a killed push
      else if (waited % 60 === 0) console.log(`pre-push: waiting for another push's check (${lock})`)
      await Bun.sleep(1000)
    }
  }
  try {
    const dir = pushCheckout(local)
    prepare(dir, local, true)
    console.log(`pre-push: just check --base ${base.slice(0, 8)} on ${local.slice(0, 8)} (tmp/hooks/push)`)
    const p = Bun.spawn([process.execPath, 'infra/dev/check.ts', '--base', base, '--isolated-db'], {
      cwd: dir,
      env: toolEnv, // check.ts picks this checkout's own CARGO_TARGET_DIR (infra/dev/cargo-target.ts)
      stdout: 'inherit',
      stderr: 'inherit',
      windowsHide: true,
    })
    return await p.exited
  } finally {
    rmSync(lock, { force: true })
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
  'verify-commit': () => verifyCommit(git('rev-parse', '--verify', `${args[0] ?? 'HEAD'}^{commit}`).out),
  commit: () => commit(args),
  push: async () => push(args),
  fmt: () => fmt(args),
}
const handler = commands[command]
if (!handler) {
  console.error(`usage: bun infra/dev/hooks.ts ${Object.keys(commands).join('|')}`)
  process.exit(2)
}
process.exit(await handler())
