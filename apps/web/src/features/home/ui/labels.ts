import { m } from '#/paraglide/messages'
import type { ActivityProgressState, ResultKind } from '#/shared/api/gen/types.gen'
import type { StatusTone } from '#/shared/components/status-badge'

import type { AttentionKind } from '../model/agenda'

type Status = { label: () => string; tone: StatusTone }

export const progressStates = {
  not_started: { label: m.home_state_not_started, tone: 'neutral' },
  in_progress: { label: m.home_state_in_progress, tone: 'info' },
  submitted: { label: m.home_state_submitted, tone: 'info' },
  needs_grading: { label: m.home_state_needs_grading, tone: 'info' },
  returned: { label: m.home_state_returned, tone: 'warning' },
  graded: { label: m.home_state_graded, tone: 'info' },
  passed: { label: m.home_state_passed, tone: 'success' },
  failed: { label: m.home_state_failed, tone: 'destructive' },
  completed: { label: m.home_state_completed, tone: 'success' },
} satisfies Record<ActivityProgressState, Status>

export const resultKinds = {
  grade_published: { label: m.home_result_published, tone: 'success' },
  submission_returned: { label: m.home_result_returned, tone: 'warning' },
} satisfies Record<ResultKind, Status>

export const attentionKinds = {
  overdue: { label: m.home_kind_overdue, tone: 'destructive' },
  returned_for_revision: { label: m.home_kind_returned, tone: 'warning' },
} satisfies Record<AttentionKind, Status>
