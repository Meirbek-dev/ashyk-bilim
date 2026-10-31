import type { Enrollment } from '#/shared/api/gen/types.gen'

import type { RunState } from '../route'

export { RUN_STATES, type RunState } from '../route'

/**
 * The server's own rule, `learning_status`: completed from 100 %, in progress once anything is done or handed in
 * (work waiting for a grade counts, learn-B). Nothing is recounted here.
 */
export const runState = (run: Pick<Enrollment, 'learning_status'>): RunState => run.learning_status

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

type NextOf = Pick<Enrollment, 'learning_status' | 'next_activity_id'> & {
  course: Pick<Enrollment['course'], 'archived_at_unix'>
}

/**
 * Where "Continue"/"Start" goes: the server's next activity of a course not yet completed; null means the course page.
 * An archived course takes no more work, so it opens its page too.
 */
export const nextActivity = (run: NextOf): string | null =>
  runState(run) === 'completed' || run.course.archived_at_unix ? null : run.next_activity_id
