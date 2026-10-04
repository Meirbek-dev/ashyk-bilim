import type { TrailRun } from '#/shared/api/gen/types.gen'

import type { RunState } from '../route'

export { RUN_STATES, type RunState } from '../route'

/**
 * The server's own rule (learner-state `enrollment_state`: completed from 100 %), read from the run's
 * `progress_pct`; no progress row yet (null) or 0 % is "not started". Nothing is recounted here.
 */
export function runState(run: Pick<TrailRun, 'progress_pct'>): RunState {
  const percent = run.progress_pct ?? 0
  if (percent >= 100) return 'completed'
  return percent > 0 ? 'in_progress' : 'not_started'
}

/** Archived courses stay (history, certificates) but go after the live ones; otherwise the server's order. */
export const orderRuns = (runs: readonly TrailRun[]): TrailRun[] =>
  runs.toSorted((a, b) => Number(Boolean(a.course.archived_at_unix)) - Number(Boolean(b.course.archived_at_unix)))

export const countByState = (runs: readonly TrailRun[]): Record<RunState, number> => {
  const counts = { in_progress: 0, not_started: 0, completed: 0 }
  for (const run of runs) counts[runState(run)] += 1
  return counts
}
