import { expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { StudentSubmission } from '#/shared/api/gen/types.gen'
import { formatPercent } from '#/shared/i18n/format'

import { outcome } from './attempt-detail'

const graded = (patch: Partial<StudentSubmission>): StudentSubmission => ({
  answered_count: 1,
  answers: {},
  assessment_id: 'a1',
  attempt_number: 1,
  auto_score: 80,
  auto_submit_reason: null,
  draft_version: 1,
  final_score: 80,
  graded_at_unix: 2,
  grading: null,
  id: 's1',
  is_late: false,
  late_penalty_pct: null,
  release_state: 'visible',
  started_at_unix: 1,
  status: 'graded',
  submitted_at_unix: 2,
  time_remaining_seconds: null,
  time_remaining_reason: null,
  total_items: 1,
  violation_count: 0,
  ...patch,
})

test('B-COD-26 a late hand-in says the penalty its score already carries; one in time says none', () => {
  const late = outcome(graded({ is_late: true, final_score: 70, late_penalty_pct: 10 }))
  expect(late).toEqual([
    m.code_result_score({ score: formatPercent(70) }),
    m.code_result_late_penalty({ percent: formatPercent(10) }),
  ])
  expect(outcome(graded({}))).toEqual([m.code_result_score({ score: formatPercent(80) })])
})
