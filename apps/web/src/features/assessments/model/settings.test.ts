import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import type { AuditEvent, Policy, ReadinessIssueCode, StudentOverride } from '#/shared/api/gen/types.gen'
import { toDateTimeInput } from '#/shared/i18n/format'

import { detailsBody, detailsFormSchema } from './details'
import { overrideBody, overrideForm, overrideFormSchema } from './overrides'
import { policyBody, policyForm, policyFormSchema } from './policy'
import { auditActor, canMove, lifecycleOf, sortedIssues } from './publishing'

// 2026-02-01 14:30 in Almaty (UTC+5) is 09:30 UTC.
const FEB_1_1430 = Date.UTC(2026, 1, 1, 9, 30) / 1000

const policy: Policy = {
  allow_late: false,
  attempt_penalty_percent: 5,
  completion_rule: 'passed',
  copy_paste_protection: true,
  devtools_detection: false,
  due_at_unix: FEB_1_1430,
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
  tab_switch_detection: false,
  time_limit_seconds: 1500,
  violation_threshold: 3,
}

describe('rules', () => {
  test('B-ASM-17 the form reads minutes, platform-zone dates and blank = unlimited, and writes them back', () => {
    const form = policyForm(policy)
    expect(form).toMatchObject({ max_attempts: '', time_limit_minutes: '25', due_at: '2026-02-01T14:30' })
    expect(v.is(policyFormSchema, form)).toBe(true)
    const body = policyBody({ ...form, max_attempts: '3', time_limit_minutes: '' }, policy, 'quiz')
    expect(body).toMatchObject({ max_attempts: 3, time_limit_seconds: null, due_at_unix: FEB_1_1430 })
    expect(body.attempt_penalty_percent).toBe(5)
    expect(body.completion_rule).toBe('passed')
    expect(policyBody({ ...form, due_at: '' }, policy, 'quiz').due_at_unix).toBeNull()
    expect(toDateTimeInput(FEB_1_1430)).toBe('2026-02-01T14:30')
  })

  test('B-ASM-17 late policies: a penalty needs its numbers, a cutoff its date', () => {
    const form = policyForm(policy)
    expect(v.is(policyFormSchema, { ...form, late_kind: 'penalty' })).toBe(false)
    const penalty = { ...form, late_kind: 'penalty' as const, percent_per_day: '10', max_days: '3' }
    expect(policyBody(penalty, policy, 'quiz').late_policy).toEqual({
      kind: 'penalty',
      percent_per_day: 10,
      max_days: 3,
    })
    expect(v.is(policyFormSchema, { ...form, late_kind: 'cutoff' })).toBe(false)
    const cutoff = { ...form, late_kind: 'cutoff' as const, cutoff_at: '2026-02-01T14:30' }
    expect(policyBody(cutoff, policy, 'quiz').late_policy).toEqual({ kind: 'cutoff', cutoff_at_unix: FEB_1_1430 })
    expect(v.is(policyFormSchema, { ...form, max_attempts: 'two' })).toBe(false)
  })

  test('B-ASM-18 anti-cheat is written for an exam only; a quiz keeps the stored values', () => {
    const form = { ...policyForm(policy), copy_paste_protection: false, violation_threshold: '5' }
    expect(policyBody(form, policy, 'exam')).toMatchObject({ copy_paste_protection: false, violation_threshold: 5 })
    expect(policyBody(form, policy, 'quiz')).toMatchObject({ copy_paste_protection: true, violation_threshold: 3 })
  })

  test('B-ASM-16 basics: weight within 0..100 (comma too), description up to the contract limit', () => {
    const form = { description: 'd', weight: '12,5', grading_type: 'numeric' as const }
    expect(v.is(detailsFormSchema, form)).toBe(true)
    expect(detailsBody(form)).toEqual({ description: 'd', weight: 12.5, grading_type: 'numeric' })
    expect(v.is(detailsFormSchema, { ...form, weight: '101' })).toBe(false)
    expect(v.is(detailsFormSchema, { ...form, weight: '' })).toBe(false)
  })
})

const issue = (code: ReadinessIssueCode, severity: 'blocker' | 'warning') =>
  ({ area: 'questions', code, item_id: null, message: '', severity }) as const

const event = (actor: string | null, by?: string): AuditEvent => ({
  actor_id: actor,
  actor_name: null,
  created_at_unix: 0,
  event: 'lifecycle-transition',
  id: 'e',
  payload: { from: 'draft', to: 'published', ...(by ? { by } : {}) },
})

describe('exceptions and publishing', () => {
  test('B-ASM-21 an exception sends only what is set and keeps an expiry set elsewhere (BUG-317)', () => {
    const stored: StudentOverride = {
      created_at_unix: 0,
      updated_at_unix: 0,
      due_at_override_unix: FEB_1_1430,
      expires_at_unix: FEB_1_1430 + 86_400,
      granted_by: null,
      granted_by_name: null,
      user_display_name: null,
      id: 'o',
      max_attempts_override: null,
      note: 'n',
      user_id: 'u',
      waive_late_penalty: true,
    }
    const form = overrideForm(stored)
    expect(form).toEqual({ user_id: 'u', attempts: '', due_at: '2026-02-01T14:30', waive: true, note: 'n' })
    expect(overrideBody({ ...form, attempts: '2' }, stored)).toEqual({
      max_attempts_override: 2,
      due_at_override_unix: FEB_1_1430,
      expires_at_unix: FEB_1_1430 + 86_400,
      waive_late_penalty: true,
      note: 'n',
    })
    expect(v.is(overrideFormSchema, { ...form, user_id: '' })).toBe(false)
  })

  test('B-ASM-22 readiness: blockers come first', () => {
    const sorted = sortedIssues([issue('policy.due_at_past', 'warning'), issue('assessment.empty', 'blocker')])
    expect(sorted.map(row => row.code)).toEqual(['assessment.empty', 'policy.due_at_past'])
  })

  test('B-ASM-23 the transitions the buttons offer are the server allowed_transitions', () => {
    expect(canMove({ allowed_transitions: ['draft', 'archived'] }, 'archived')).toBe(true)
    expect(canMove({ allowed_transitions: ['draft'] }, 'published')).toBe(false)
  })

  test('B-ASM-26 the log names events, transitions and who: you, the scheduler or someone else', () => {
    expect(lifecycleOf('published')).toBe('published')
    expect(lifecycleOf('weird')).toBeNull()
    expect(auditActor(event('me'), 'me')).toBe('you')
    expect(auditActor(event('other'), 'me')).toBe('other')
    expect(auditActor(event('me', 'scheduler'), 'me')).toBe('system')
    expect(auditActor(event(null), 'me')).toBe('system')
  })
})
