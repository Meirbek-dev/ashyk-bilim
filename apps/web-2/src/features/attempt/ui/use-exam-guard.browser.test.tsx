import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { Policy, StudentSubmission } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { RunnerAlerts } from './runner-alerts'
import { useExamGuard } from './use-exam-guard'

const policy: Policy = {
  allow_late: true,
  attempt_penalty_percent: 0,
  completion_rule: 'passed',
  copy_paste_protection: false,
  devtools_detection: false,
  due_at_unix: null,
  fullscreen_required: false,
  grace_period_minutes: 0,
  grade_release_mode: 'immediate',
  grading_mode: 'auto',
  late_policy: { kind: 'none' },
  max_attempts: null,
  negative_marking_percent: 0,
  partial_credit: false,
  passing_score: 60,
  randomize_options: false,
  randomize_questions: false,
  required: true,
  review_visibility: 'full',
  right_click_disabled: false,
  tab_switch_detection: true,
  time_limit_seconds: null,
  violation_threshold: 3,
}

const attempt: StudentSubmission = {
  answered_count: 0,
  answers: {},
  assessment_id: 'a1',
  attempt_number: 1,
  auto_score: null,
  auto_submit_reason: null,
  draft_version: 1,
  final_score: null,
  graded_at_unix: null,
  grading: null,
  id: 's1',
  is_late: false,
  late_penalty_pct: null,
  release_state: 'hidden',
  started_at_unix: 1,
  status: 'draft',
  submitted_at_unix: null,
  time_remaining_seconds: null,
  time_remaining_reason: null,
  total_items: 1,
  violation_count: 3,
}

function Guard({ count, detection }: { count: number; detection: boolean }) {
  const guard = useExamGuard({ ...policy, tab_switch_detection: detection }, { ...attempt, violation_count: count })
  return (
    <RunnerAlerts
      guard={guard}
      closed={null}
      expired={null}
      runningOut={false}
      changed={false}
      attemptId={attempt.id}
    />
  )
}

test.each([
  { count: 3, detection: true, exceeded: true },
  { count: 2, detection: true, exceeded: false },
  { count: 3, detection: false, exceeded: false },
])(
  'restored exam violations show the zero-score warning when applicable: %j',
  async ({ count, detection, exceeded }) => {
    const screen = await renderInRouter(
      <QueryClientProvider client={new QueryClient()}>
        <Guard count={count} detection={detection} />
      </QueryClientProvider>,
    )
    const warning = screen.getByText(m.attempt_violations_exceeded())
    if (exceeded) await expect.element(warning).toBeVisible()
    else await expect.element(warning).not.toBeInTheDocument()
  },
)
