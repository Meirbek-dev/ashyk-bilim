#!/usr/bin/env bun
// `just brief`: the state an agent needs before work, in one call (~30 lines) instead of a dozen reads.
//   vcs        jj/git, unpushed commits, uncommitted files
//   stack      shared containers and running dev slots
//   last runs  the latest `just check` gates and e2e summary (from tmp/; nothing is re-run)
//   owner      open QUESTIONS.md items, FINDINGS.md headings, web-2 BACKLOG size
//   prod       one line from `just prod-report` when production runs on this host
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dir, '../..')
const sh = (cmd: string[], cwd = root) => {
  const p = spawnSync(cmd[0]!, cmd.slice(1), { cwd, encoding: 'utf8', timeout: 30_000 })
  return p.status === 0 ? (p.stdout ?? '').trim() : ''
}
const ago = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60_000)
  return m < 90 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`
}
const out: string[] = []
const section = (title: string, lines: string[]) => out.push(`${title}`, ...lines.map(l => `  ${l}`))

// vcs
const jj = existsSync(join(root, '.jj')) && sh(['jj', '--version']) !== ''
const unpushed = sh(['git', 'log', '--oneline', '--no-decorate', 'origin/main..main']).split('\n').filter(Boolean)
const dirty = jj
  ? sh(['jj', 'diff', '--name-only', '-r', '@']).split('\n').filter(Boolean)
  : sh(['git', 'status', '--porcelain']).split('\n').filter(Boolean)
const local = jj
  ? sh([
      'jj',
      'log',
      '--no-graph',
      '-r',
      'main..@-',
      '-T',
      'commit_id.short() ++ " " ++ description.first_line() ++ "\\n"',
    ])
      .split('\n')
      .filter(Boolean)
  : []
section(`vcs (${jj ? 'jj: commit with `just commit`, push with `just push`' : 'git'})`, [
  `main: ${unpushed.length} unpushed commit(s)${unpushed[0] ? `, last: ${unpushed[0]}` : ''}`,
  ...(local.length ? [`${local.length} commit(s) above main: ${local.slice(0, 3).join('; ')}`] : []),
  `working copy: ${dirty.length} changed file(s)${dirty.length ? `: ${dirty.slice(0, 6).join(' ')}${dirty.length > 6 ? ' …' : ''}` : ''}`,
])

// stack
const stack = spawnSync('bun', ['infra/dev/stack.ts', 'status', ...[0, 1, 2, 3].map(String)], {
  cwd: root,
  encoding: 'utf8',
  timeout: 30_000,
})
const lines = `${stack.stdout ?? ''}`.split('\n')
const down = lines.flatMap(l => /^slot (\d+): down/.exec(l)?.[1] ?? [])
const slots = [
  ...lines.filter(l => /^containers|^slot \d+: (?!down)/.test(l)),
  ...(down.length ? [`slots down: ${down.join(' ')}`] : []),
]
section(
  'stack (just stack status [slot])',
  slots.length ? slots : [`status failed: ${(stack.stderr ?? '').trim().slice(0, 200)}`],
)

// last runs
const runs: string[] = []
const last = join(root, 'tmp/check/last.txt')
if (existsSync(last)) {
  const [stamp = '', ...verdict] = readFileSync(last, 'utf8').trim().split(' ')
  runs.push(`${verdict.join(' ')} ${ago(Date.parse(stamp))} (logs: tmp/check/)`)
}
const e2eLogs = existsSync(join(root, 'tmp/e2e'))
  ? readdirSync(join(root, 'tmp/e2e'))
      .map(d => join(root, 'tmp/e2e', d, 'playwright.log'))
      .filter(existsSync)
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  : []
if (e2eLogs[0]) {
  const { playwrightSummary } = await import('./e2e.ts')
  const summary = playwrightSummary(readFileSync(e2eLogs[0], 'utf8'), e2eLogs[0])?.split('\n')[0] ?? 'no summary'
  runs.push(`${summary} ${ago(statSync(e2eLogs[0]).mtimeMs)} (${e2eLogs[0].slice(root.length + 1)})`)
}
section('last runs', runs.length ? runs : ['none in tmp/'])

// owner
const read = (path: string) => (existsSync(join(root, path)) ? readFileSync(join(root, path), 'utf8') : '')
const questions = read('QUESTIONS.md').match(/^## Q-.*$/gm) ?? []
const findings = read('docs/FINDINGS.md').match(/^### .*$/gm) ?? []
const backlog = read('apps/web-2/BACKLOG.md').match(/^\s*[-*] /gm) ?? []
section('owner', [
  `QUESTIONS.md: ${questions.length} open${questions.length ? ` (${questions.map(q => q.slice(3, 60)).join('; ')})` : ''}`,
  `FINDINGS.md: ${findings.length} open; web-2 BACKLOG.md: ${backlog.length} item(s)`,
])

// prod
const prod = spawnSync('docker', ['ps', '-q', '--filter', 'label=com.docker.compose.project=cs-mooc'], {
  encoding: 'utf8',
})
if (prod.status === 0 && prod.stdout.trim()) {
  const report =
    spawnSync('bun', ['infra/dev/prod-report.ts'], { cwd: root, encoding: 'utf8', timeout: 60_000 }).stdout ?? ''
  const count = (title: string) => {
    const body = report.split(/\n(?=\S)/).find(s => s.startsWith(title)) ?? ''
    return body
      .split('\n')
      .slice(1)
      .filter(l => /^\s+\d+\s/.test(l)).length
  }
  const fiveXX = /(\d+) of \d+ requests answered 5xx/.exec(report)?.[1] ?? '?'
  const down = (report.match(/^ {2}!! .*/gm) ?? []).map(l => l.trim().split(/\s+/)[1])
  out.push(
    `prod (just prod-report): ${count('server and worker')} warning kind(s), ${fiveXX} 5xx, ${count('failed/dead jobs')} failed job kind(s) in 24 h; containers flagged: ${down.length ? down.join(' ') : 'none'}`,
  )
}

console.log(out.join('\n'))
