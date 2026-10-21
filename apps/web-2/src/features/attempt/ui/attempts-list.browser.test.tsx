import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { AttemptState, StudentSubmission } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/components/testing'

import { AttemptsList } from './attempts-list'

const attempt = (number: number, patch: Partial<StudentSubmission>): StudentSubmission => ({
  answered_count: 1,
  answers: {},
  assessment_id: 'q',
  attempt_number: number,
  auto_score: null,
  auto_submit_reason: null,
  draft_version: 1,
  final_score: null,
  graded_at_unix: null,
  grading: null,
  id: `s${number}`,
  is_late: false,
  late_penalty_pct: null,
  release_state: 'visible',
  started_at_unix: null,
  status: 'published',
  submitted_at_unix: null,
  time_remaining_reason: null,
  time_remaining_seconds: null,
  total_items: 1,
  violation_count: 0,
  ...patch,
})

const state: Pick<AttemptState, 'effective'> = {
  effective: {
    allow_late: false,
    due_at_unix: null,
    late_policy: { kind: 'none' },
    max_attempts: null,
    override_applied: false,
    passing_score: 60,
    time_limit_seconds: null,
    waive_late_penalty: false,
  },
}

describe('AttemptsList', () => {
  test('B-ATT-05 a released grade reads passed or not; a hidden one keeps its status', async () => {
    const screen = await renderInRouter(
      <AttemptsList
        state={state}
        attempts={[
          attempt(3, { final_score: 40 }),
          attempt(2, { final_score: 80 }),
          attempt(1, { status: 'graded', release_state: 'awaiting_release', final_score: null }),
        ]}
      />,
    )
    await expect.element(screen.getByText(m.attempt_not_passed(), { exact: true })).toBeVisible()
    await expect.element(screen.getByText(m.attempt_passed(), { exact: true })).toBeVisible()
    await expect.element(screen.getByText(m.attempt_status_graded(), { exact: true })).toBeVisible()
  })
})
