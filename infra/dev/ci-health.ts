// CI on main over the last 30 days, for `just metrics`: how often a push went red and how often a run needed a re-run
// (a flaky gate shows up as re-runs before it shows up as red).
import { spawnSync } from 'node:child_process'

export type Run = { conclusion: string; createdAt: string; attempt: number }

const MONTH = 30 * 86_400_000

/** Finished runs (cancelled ones left out), the share that failed and the share that needed a re-run. */
export function ciHealth(runs: Run[], now = Date.now()) {
  const recent = runs.filter(r => r.conclusion && r.conclusion !== 'cancelled' && now - Date.parse(r.createdAt) < MONTH)
  const share = (n: number) => (recent.length ? `${Math.round((100 * n) / recent.length)}%` : 'n/a')
  return {
    runs: recent.length,
    red: share(recent.filter(r => r.conclusion !== 'success').length),
    rerun: share(recent.filter(r => r.attempt > 1).length),
  }
}

/** The `ci` workflow's runs on main, newest first; `undefined` without a working `gh`. */
export function ciRuns(cwd: string): Run[] | undefined {
  const fields = ['--json', 'conclusion,createdAt,attempt']
  const out = spawnSync('gh', ['run', 'list', '--workflow', 'ci', '--branch', 'main', '--limit', '300', ...fields], {
    cwd,
    encoding: 'utf8',
  })
  try {
    return out.status === 0 ? (JSON.parse(out.stdout) as Run[]) : undefined
  } catch {
    return undefined
  }
}
