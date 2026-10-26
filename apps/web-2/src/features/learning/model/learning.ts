import type { Enrollment } from '#/shared/api/gen/types.gen'

import type { RunState } from '../route'

export { RUN_STATES, type RunState } from '../route'

/**
 * The server's own rule (learner-state `enrollment_state`: completed from 100 %), read from the run's
 * `progress_pct`; no progress row yet (null) or 0 % is "not started". Nothing is recounted here.
 */
export function runState(run: Pick<Enrollment, 'progress_pct'>): RunState {
  const percent = run.progress_pct ?? 0
  if (percent >= 100) return 'completed'
  return percent > 0 ? 'in_progress' : 'not_started'
}

const STATE_ORDER: Record<RunState, number> = { in_progress: 0, not_started: 1, completed: 2 }
const rank = (run: Enrollment) => (run.course.archived_at_unix ? 3 : STATE_ORDER[runState(run)])

/**
 * What the learner is working on first (B-LRN-09): in progress, not started, completed; archived courses stay
 * (history, certificates) but go last (B-LRN-06). Within a group, the server's order.
 */
export const orderRuns = (runs: readonly Enrollment[]): Enrollment[] => runs.toSorted((a, b) => rank(a) - rank(b))

export const countByState = (runs: readonly Enrollment[]): Record<RunState, number> => {
  const counts = { in_progress: 0, not_started: 0, completed: 0 }
  for (const run of runs) counts[runState(run)] += 1
  return counts
}

type NextOf = Pick<Enrollment, 'progress_pct' | 'next_activity_id'> & {
  course: Pick<Enrollment['course'], 'archived_at_unix'>
}

/**
 * Where "Continue"/"Start" goes: the server's next activity of a course not yet completed; null means the course page.
 * An archived course takes no more work, so it opens its page too.
 */
export const nextActivity = (run: NextOf): string | null =>
  runState(run) === 'completed' || run.course.archived_at_unix ? null : run.next_activity_id
