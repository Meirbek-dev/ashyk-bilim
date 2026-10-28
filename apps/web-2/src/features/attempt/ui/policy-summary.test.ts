import { describe, expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import type { AttemptState } from '#/shared/api/gen/types.gen'

import { formatDateTime, formatNumber, formatPercent } from '#/shared/i18n/format'

import { attemptsText, lateText } from './policy-summary'

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

describe('lateText', () => {
  const effective = state({}).effective

  test('B-ATT-02 a strict due date says nothing can be handed in after it', () => {
    expect(lateText({ ...effective, allow_late: false })).toBe(m.attempt_late_closed())
  })

  test('B-ATT-02 a late penalty names its price per day and its limit, unless the learner has it waived', () => {
    const penalty = { ...effective, late_policy: { kind: 'penalty' as const, percent_per_day: 10, max_days: 3 } }
    expect(lateText(penalty)).toBe(m.attempt_late_penalty_rule({ percent: formatPercent(10), days: formatNumber(3) }))
    expect(lateText({ ...penalty, waive_late_penalty: true })).toBe(m.attempt_late_free())
  })

  test('B-ATT-02 a cutoff names the last moment unless waived, and no policy means a free late hand-in', () => {
    const cutoff = { kind: 'cutoff' as const, cutoff_at_unix: 1_800_000_000 }
    expect(lateText({ ...effective, late_policy: cutoff })).toBe(
      m.attempt_late_until({ date: formatDateTime(1_800_000_000) }),
    )
    expect(lateText({ ...effective, late_policy: cutoff, waive_late_penalty: true })).toBe(m.attempt_late_free())
    // An own due date past the cutoff: no late window left.
    expect(lateText({ ...effective, late_policy: cutoff, due_at_unix: 1_800_000_000 })).toBe(m.attempt_late_closed())
    expect(lateText(effective)).toBe(m.attempt_late_free())
  })
})
