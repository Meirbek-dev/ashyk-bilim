import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { AttemptState } from '#/shared/api/gen/types.gen'

import { attemptsText } from './policy-summary'

const state = (patch: Partial<AttemptState>): AttemptState => ({
  attempts_remaining: 3,
  attempts_used: 0,
  can_continue: false,
  can_start: true,
  disabled_reasons: [],
  draft_id: null,
  effective: {
    allow_late: true,
    due_at_unix: null,
    late_policy: { kind: 'none' },
    max_attempts: 3,
    override_applied: false,
    passing_score: 60,
    time_limit_seconds: null,
    waive_late_penalty: false,
  },
  is_teacher_preview: false,
  lifecycle: 'published',
  opens_at_unix: null,
  revision_requested: false,
  ...patch,
})

describe('attemptsText', () => {
  test('B-ATT-02 before starting: attempts left of the limit', () => {
    expect(attemptsText(state({}))).toBe(m.attempt_attempts_left({ left: '3', total: '3' }))
  })

  test('B-ATT-02 an open draft is named as the running attempt, not counted as one more left', () => {
    const open = { can_continue: true, can_start: false, draft_id: 'd1' }
    expect(attemptsText(state({ ...open, attempts_used: 1, attempts_remaining: 2 }))).toBe(
      m.attempt_attempts_running({ number: '2', total: '3' }),
    )
    expect(attemptsText(state({ ...open, attempts_remaining: null }))).toBe(
      m.attempt_attempts_running_unlimited({ number: '1' }),
    )
  })
})
