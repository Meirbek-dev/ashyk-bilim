#!/usr/bin/env bun
// `just clean [--deep] [--dry-run]`: reclaim disk the dev loop leaves behind; prints what it removed and how much.
//   default  e2e stand directories and run logs older than 2 days (tmp/e2e/*-dev-*, *-runs/*), stray tmp/*.log
//            older than 14 days, the hook's index snapshot
//   --deep   also cargo incremental caches and llvm-cov artifacts of every target dir of this checkout (incl. the
//            pre-push checkout tmp/hooks/push): the next build recompiles the workspace crates, never the deps
// Never touched: reports (tmp/audit-*), databases, git/jj history, node_modules, the dependency artifacts in target/.
import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dir, '../..')
const deep = process.argv.includes('--deep')
const dry = process.argv.includes('--dry-run')
const DAY = 86_400_000

const size = (path: string) => {
  const out = spawnSync('du', ['-sk', path], { encoding: 'utf8' }).stdout ?? ''
  return Number(out.split(/\s/)[0] ?? 0) * 1024
}
const human = (bytes: number) =>
  bytes > 2 ** 30 ? `${(bytes / 2 ** 30).toFixed(1)} GB` : `${Math.round(bytes / 2 ** 20)} MB`
const older = (path: string, days: number) => Date.now() - statSync(path).mtimeMs > days * DAY
const list = (dir: string) => (existsSync(dir) ? readdirSync(dir).map(name => join(dir, name)) : [])

const doomed: string[] = []
const e2e = join(root, 'tmp/e2e')
for (const path of list(e2e)) {
  if (/-dev-\d+-\d+$/.test(path) && older(path, 2)) doomed.push(path)
  if (path.endsWith('-runs')) doomed.push(...list(path).filter(run => older(run, 2)))
}
doomed.push(...list(join(root, 'tmp')).filter(p => p.endsWith('.log') && older(p, 14)))
const snap = join(root, 'tmp/hooks/snap')
if (existsSync(snap) && older(snap, 2)) doomed.push(snap, `${snap}.index`)

if (deep) {
  const targets = [join(root, 'apps/server'), join(root, 'tmp/hooks/push/apps/server')].flatMap(dir =>
    list(dir).filter(p => /\/target(-[\w.-]+)?$/.test(p)),
  )
  for (const target of targets) {
    doomed.push(...['debug/incremental', 'release/incremental', 'llvm-cov-target'].map(p => join(target, p)))
  }
}

let freed = 0
for (const path of doomed.filter(existsSync)) {
  const bytes = size(path)
  freed += bytes
  console.log(`${dry ? 'would remove' : 'removed'} ${human(bytes).padStart(8)}  ${path.slice(root.length + 1)}`)
  if (!dry) rmSync(path, { recursive: true, force: true })
}
console.log(
  `clean: ${dry ? 'would free' : 'freed'} ${human(freed)}${deep ? '' : ' (--deep: cargo incremental and coverage caches)'}`,
)
