import { m } from '#/paraglide/messages'
import type { ActivityProgressStatus, RecentResult, ResultKind } from '#/shared/api/gen/types.gen'
import type { StatusTone } from '#/shared/components/status-badge'

import type { AttentionKind } from '../model/agenda'

type Status = { label: () => string; tone: StatusTone }

const outcomes = {
  passed: { label: m.home_state_passed, tone: 'success' },
  failed: { label: m.home_state_failed, tone: 'destructive' },
} satisfies Record<string, Status>

const progressStatuses = {
  not_started: { label: m.home_state_not_started, tone: 'neutral' },
  in_progress: { label: m.home_state_in_progress, tone: 'info' },
  submitted: { label: m.home_state_submitted, tone: 'info' },
  needs_grading: { label: m.home_state_needs_grading, tone: 'info' },
  returned: { label: m.home_state_returned, tone: 'warning' },
  graded: { label: m.home_state_graded, tone: 'info' },
  released: outcomes.failed,
  completed: { label: m.home_state_completed, tone: 'success' },
} satisfies Record<ActivityProgressStatus, Status>

/** A progress status; a released grade shows how it ended (`passed`). */
export const progressStatus = (status: ActivityProgressStatus, passed: boolean | null): Status =>
  status === 'released' && passed ? outcomes.passed : progressStatuses[status]

const resultKinds = {
  grade_published: { label: m.home_result_published, tone: 'success' },
  submission_returned: { label: m.home_result_returned, tone: 'warning' },
} satisfies Record<ResultKind, Status>

/** A graded test says passed or not (B-HOME-05): a green «Оценено» beside «0 %» read as a success. */
export const resultStatus = (result: Pick<RecentResult, 'kind' | 'passed'>): Status =>
  result.passed === null ? resultKinds[result.kind] : outcomes[result.passed ? 'passed' : 'failed']

export const attentionKinds = {
  overdue: { label: m.home_kind_overdue, tone: 'destructive' },
  returned_for_revision: { label: m.home_kind_returned, tone: 'warning' },
} satisfies Record<AttentionKind, Status>
