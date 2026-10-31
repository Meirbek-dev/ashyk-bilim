// Gate hit ledger: every red gate of `just check`, the commit hooks and web-2's gates appends one line to
// <main checkout>/tmp/gates/hits.jsonl, so `just metrics` can show which gates caught something in the last 30 days
// (a gate that never fires costs every run and teaches agents nothing). Local runs only; CI does not record.
import { spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export type Hit = { at: string; source: string; gate: string; rule?: string; file?: string }

/** The main checkout's tmp/gates/hits.jsonl, also from a linked worktree (hook checkout, `just wt`). */
export function ledgerPath(cwd = import.meta.dir): string {
  const common = spawnSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
    cwd,
    encoding: 'utf8',
  })
  const repo = common.status === 0 ? dirname(common.stdout.trim()) : resolve(import.meta.dir, '../..')
  return join(repo, 'tmp', 'gates', 'hits.jsonl')
}

export function recordHits(source: string, hits: Omit<Hit, 'at' | 'source'>[], cwd?: string): void {
  if (process.env['CI'] || hits.length === 0) return
  try {
    const path = ledgerPath(cwd)
    mkdirSync(dirname(path), { recursive: true })
    const at = new Date().toISOString()
    appendFileSync(path, hits.map(hit => JSON.stringify({ at, source, ...hit })).join('\n') + '\n')
  } catch {
    // The ledger is a statistic: never fail a gate over it.
  }
}

export function readHits(days: number, path = ledgerPath()): Hit[] {
  if (!existsSync(path)) return []
  const since = Date.now() - days * 86_400_000
  return readFileSync(path, 'utf8')
    .split('\n')
    .flatMap(line => {
      try {
        const hit = JSON.parse(line) as Hit
        return Date.parse(hit.at) >= since ? [hit] : []
      } catch {
        return []
      }
    })
}
