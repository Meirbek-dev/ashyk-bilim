// `just wt new|ls|land|rm <name>`: one git worktree per parallel task, next to the main checkout.
//   new <name>   ../ashyq-wt/<name> on branch wt/<name> from main; node_modules (root, apps/web, apps/web-2) are
//                links to the main checkout's, cargo shares one target dir, Paraglide output is generated.
//   ls           worktrees with their branch, commits ahead of main and uncommitted files
//   land <name>  rebase onto main, `just check`, fast-forward main (the main checkout), remove the worktree
//   rm <name>    remove the worktree and branch (refuses unlanded or uncommitted work without --force)
// A worktree that changes package.json/bun.lock must not use the shared node_modules: delete the link, bun install.
import {
  appendFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'

const LINKED = ['.', 'apps/web', 'apps/web-2']

function sh(cmd: string[], cwd?: string, inherit = false): { code: number; out: string } {
  const p = Bun.spawnSync(cmd, { cwd, stdout: inherit ? 'inherit' : 'pipe', stderr: inherit ? 'inherit' : 'pipe' })
  return { code: p.exitCode ?? 1, out: inherit ? '' : `${p.stdout.toString()}${p.stderr.toString()}`.trim() }
}

function fail(message: string): never {
  console.error(`wt: ${message}`)
  process.exit(1)
}

const commonDir = sh(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir']).out
if (!commonDir) fail('not inside the repository')
const main = dirname(commonDir) // the main checkout (branch main)
const root = join(dirname(main), 'ashyq-wt')
const git = (...args: string[]) => sh(['git', '-C', main, ...args])

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink() // junctions too
  } catch {
    return false
  }
}

function target(name: string | undefined): { name: string; path: string; branch: string } {
  if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) fail('name: lowercase letters, digits and dashes')
  return { name, path: join(root, name), branch: `wt/${name}` }
}

// Same default as apps/server/justfile, so `just server ...` and plain cargo in any worktree share artifacts.
function cargoTarget(): string {
  if (process.platform === 'win32') return join(process.env['LOCALAPPDATA'] ?? main, 'ashyq-bilim', 'cargo-target')
  return join(main, 'apps', 'server', 'target')
}

function create(name?: string): void {
  const wt = target(name)
  if (existsSync(wt.path)) fail(`${wt.path} exists`)
  mkdirSync(root, { recursive: true })
  const add = git('worktree', 'add', '-b', wt.branch, wt.path, 'main')
  if (add.code !== 0) fail(add.out)
  for (const dir of LINKED) {
    const real = join(main, dir, 'node_modules')
    if (existsSync(real)) symlinkSync(real, join(wt.path, dir, 'node_modules'), 'junction') // a symlink off Windows
  }
  // Untracked cargo config in the worktree only; excluded for every worktree via the shared info/exclude.
  mkdirSync(join(wt.path, '.cargo'), { recursive: true })
  writeFileSync(join(wt.path, '.cargo', 'config.toml'), `[build]\ntarget-dir = ${JSON.stringify(cargoTarget())}\n`)
  const exclude = join(commonDir, 'info', 'exclude')
  if (!existsSync(exclude) || !readFileSync(exclude, 'utf8').includes('/.cargo/')) {
    mkdirSync(dirname(exclude), { recursive: true })
    appendFileSync(exclude, '\n/.cargo/\n')
  }
  const gen = sh(['bun', 'gates/codegen.ts', 'messages'], join(wt.path, 'apps/web-2'))
  if (gen.code !== 0) console.log(`wt: web-2 messages codegen failed (run it in apps/web-2): ${gen.out.slice(-300)}`)
  console.log(`wt: ${wt.path} on ${wt.branch} (from main ${git('rev-parse', '--short', 'main').out})`)
  console.log(`    shared: node_modules (main checkout), cargo target ${cargoTarget()}`)
  console.log(`    commit there as usual (hooks run per worktree); then: just wt land ${wt.name}`)
}

function list(): void {
  const blocks = git('worktree', 'list', '--porcelain').out.split(/\n\n/)
  for (const block of blocks) {
    const path = /^worktree (.+)$/m.exec(block)?.[1] ?? ''
    const branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? '(detached)'
    const head = /^HEAD (\w+)$/m.exec(block)?.[1] ?? ''
    const count = (range: string) => sh(['git', '-C', main, 'rev-list', '--count', range]).out
    const dirty = sh(['git', '-C', path, 'status', '--porcelain']).out.split('\n').filter(Boolean).length
    const state = branch === 'main' ? '' : ` +${count(`main..${head}`)}/-${count(`${head}..main`)} vs main`
    console.log(`${branch.padEnd(24)} ${path}${state}${dirty ? `, ${dirty} uncommitted` : ''}`)
  }
}

// Unlink the node_modules links first: removing a tree never follows them into the main checkout's packages.
function remove(wt: { path: string; branch: string }, force: boolean): void {
  for (const dir of LINKED) {
    const link = join(wt.path, dir, 'node_modules')
    if (isLink(link)) rmSync(link)
  }
  rmSync(wt.path, { recursive: true, force: true }) // long Windows paths: Node handles them, git worktree remove may not
  git('worktree', 'prune')
  const del = git('branch', force ? '-D' : '-d', wt.branch)
  console.log(`wt: removed ${wt.path}${del.code === 0 ? ` and ${wt.branch}` : `; branch kept: ${del.out}`}`)
}

function land(name?: string): void {
  const wt = target(name)
  if (!existsSync(wt.path)) fail(`no worktree ${wt.path}`)
  if (sh(['git', 'status', '--porcelain'], wt.path).out) fail(`${wt.path} has uncommitted changes: commit or discard`)
  if (git('symbolic-ref', '--short', 'HEAD').out !== 'main') fail(`${main} is not on main`)
  console.log(`wt: rebasing ${wt.branch} onto main`)
  if (sh(['git', 'rebase', 'main'], wt.path).code !== 0) {
    sh(['git', 'rebase', '--abort'], wt.path)
    fail(`rebase onto main conflicts; resolve in ${wt.path} (git rebase main), then land again`)
  }
  if (sh(['just', '--show', 'check'], wt.path).code !== 0)
    console.log('wt: no `just check` recipe on this branch: skipped')
  else if (sh(['just', 'check'], wt.path, true).code !== 0)
    fail(`just check is red in ${wt.path}; fix, commit, land again`)
  const ff = git('merge', '--ff-only', '--quiet', wt.branch)
  if (ff.code !== 0) fail(`fast-forward of main failed (main moved or local changes in the way):\n${ff.out}`)
  console.log(`wt: main is now ${git('log', '--oneline', '-1').out}`)
  remove(wt, false)
  console.log('wt: push when ready: git push origin main (pre-push runs just check)')
}

function drop(name?: string, force = false): void {
  const wt = target(name)
  if (!existsSync(wt.path)) fail(`no worktree ${wt.path}`)
  const dirty = sh(['git', 'status', '--porcelain'], wt.path).out
  const unlanded = git('rev-list', '--count', `main..${wt.branch}`).out
  if (!force && (dirty || unlanded !== '0'))
    fail(`${wt.path}: ${unlanded} unlanded commit(s)${dirty ? ', uncommitted changes' : ''}; --force drops them`)
  remove(wt, true)
}

const [command, name, flag] = process.argv.slice(2)
if (command === 'new') create(name)
else if (command === 'ls') list()
else if (command === 'land') land(name)
else if (command === 'rm') drop(name, flag === '--force')
else fail('usage: just wt new <name> | ls | land <name> | rm <name> [--force]')
