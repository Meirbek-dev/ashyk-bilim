import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import { ApiError } from '#/shared/api/errors'
import type { AssessmentItem, AttemptState, ErrorCode, ItemBody, Policy } from '#/shared/api/gen/types.gen'

import { attemptSearchSchema } from '../route'
import { answerText, correctText } from './answer-text'
import {
  clock,
  entryAction,
  isBlank,
  needsRemediation,
  protections,
  retryDelayMs,
  saveOutcome,
  saveStatus,
  secondsLeft,
  submitOutcome,
  unanswered,
} from './attempt'

const state = (patch: Partial<AttemptState> = {}): AttemptState => ({
  attempts_remaining: null,
  attempts_used: 0,
  can_continue: false,
  can_start: true,
  disabled_reasons: [],
  draft_id: null,
  effective: {
    allow_late: true,
    due_at_unix: null,
    late_policy: { kind: 'none' },
    max_attempts: null,
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

const apiError = (status: number, code: ErrorCode, retryAfter: number | null = null) =>
  new ApiError({ status, code, fieldErrors: [], requestId: null, retryAfter })

const choice: ItemBody = {
  kind: 'choice',
  explanation: null,
  variant: 'single_choice',
  options: [
    { id: 'o1', text: 'One' },
    { id: 'o2', text: 'Two' },
  ],
}
const item = (id: string, body: ItemBody = choice): AssessmentItem => ({
  id,
  body,
  kind: body.kind,
  max_score: 1,
  metadata: { difficulty: null, estimated_minutes: null, section_label: null },
  position: 1,
  title: id,
})

describe('attempt model', () => {
  test('B-ATT-03 the entry action comes from attempt-state: continue, start, revise or the reasons', () => {
    expect(entryAction(state({ can_continue: true, draft_id: 'd1', can_start: false }))).toEqual({
      kind: 'continue',
      draftId: 'd1',
    })
    expect(entryAction(state())).toEqual({ kind: 'start', revision: false })
    expect(entryAction(state({ revision_requested: true }))).toEqual({ kind: 'start', revision: true })
    expect(entryAction(state({ can_start: false, disabled_reasons: ['PAST_DUE'] }))).toEqual({
      kind: 'blocked',
      reasons: ['PAST_DUE'],
    })
  })

  test('B-ATT-20 remediation is required only when the server says so', () => {
    expect(needsRemediation(state({ can_start: false, disabled_reasons: ['REMEDIATION_REQUIRED'] }))).toBe(true)
    expect(needsRemediation(state())).toBe(false)
  })

  test('B-ATT-21 B-ATT-04 the client applies the protections the policy turns on (devtools is not one)', () => {
    const off = { tab_switch_detection: false, copy_paste_protection: false, right_click_disabled: false }
    const policy = (patch: Partial<Policy>) => ({ ...off, fullscreen_required: false, ...patch })
    expect(protections(policy({ devtools_detection: true }))).toEqual([])
    expect(protections(policy({ tab_switch_detection: true, fullscreen_required: true }))).toEqual([
      'tab_switch',
      'fullscreen',
    ])
  })
})

describe('attempt answers and outcomes', () => {
  test('B-ATT-16 B-ATT-07 a question is unanswered when its answer says nothing, for every kind', () => {
    expect(isBlank(undefined)).toBe(true)
    expect(isBlank({ kind: 'choice', selected: [] })).toBe(true)
    expect(isBlank({ kind: 'open_text', text: '  ' })).toBe(true)
    expect(isBlank({ kind: 'form', values: { a: ' ' } })).toBe(true)
    expect(isBlank({ kind: 'matching', matches: [] })).toBe(true)
    expect(isBlank({ kind: 'code', language: 71, source: '' })).toBe(true)
    expect(isBlank({ kind: 'form', values: { a: '1' } })).toBe(false)
    const items = [item('q1'), item('q2'), item('q3')]
    expect(unanswered(items, { q2: { kind: 'choice', selected: ['o1'] } }).map(entry => entry.number)).toEqual([1, 3])
  })

  test('B-ATT-14 the clock runs from the server seconds and when they arrived; never below zero', () => {
    expect(secondsLeft(60, 1_000, 1_000)).toBe(60)
    expect(secondsLeft(60, 1_000, 31_500)).toBe(30)
    expect(secondsLeft(60, 1_000, 99_000)).toBe(0)
    expect(clock(65)).toBe('01:05')
    expect(clock(3_725)).toBe('1:02:05')
  })

  test('B-ATT-12 B-ATT-13 B-ATT-15 a failed save says what to do next', () => {
    expect(saveOutcome(new TypeError('Failed to fetch'))).toBe('network')
    expect(saveOutcome(apiError(503, 'service-unavailable'))).toBe('network')
    expect(saveOutcome(apiError(409, 'conflict'))).toBe('conflict')
    expect(saveOutcome(apiError(429, 'rate-limited', 3))).toBe('throttled')
    expect(saveOutcome(apiError(403, 'forbidden'))).toBe('closed')
    expect(saveOutcome(apiError(404, 'not-found'))).toBe('gone')
    expect(retryDelayMs(apiError(429, 'rate-limited', 3))).toBe(3_000)
    expect(retryDelayMs(new TypeError('offline'))).toBe(5_500)
  })

  test('B-ATT-09 the save indicator has three states: offline wins, then anything queued', () => {
    expect(saveStatus(false, null, 0)).toBe('offline')
    expect(saveStatus(true, 'network', 2)).toBe('offline')
    expect(saveStatus(true, 'conflict', 1)).toBe('saving')
    expect(saveStatus(true, null, 0)).toBe('saved')
  })

  test('B-ATT-17 a failed hand-in: lost reply retries, 409 rereads the attempt, 403 is closed', () => {
    expect(submitOutcome(new TypeError('Failed to fetch'))).toBe('network')
    expect(submitOutcome(apiError(409, 'conflict'))).toBe('reread')
    expect(submitOutcome(apiError(403, 'forbidden'))).toBe('closed')
    expect(submitOutcome(apiError(422, 'validation-failed'))).toBe('failed')
  })

  test('B-ATT-06 the question number lives in the URL; junk falls back', () => {
    const id = '0b7c2f1e-1d2a-4c3b-9f8e-7a6b5c4d3e2f'
    expect(v.parse(attemptSearchSchema, { attempt: id, item: 3 })).toEqual({ attempt: id, item: 3 })
    expect(v.parse(attemptSearchSchema, { attempt: 'x', item: -1 })).toEqual({ attempt: undefined, item: 1 })
  })

  test('B-ATT-18 answers and the answer key read as text through the item the learner saw', () => {
    expect(answerText(choice, { kind: 'choice', selected: ['o2'] })).toBe('Two')
    expect(correctText(choice, ['o1'])).toBe('One')
    const matching: ItemBody = { kind: 'matching', left: [], right: [] }
    expect(answerText(matching, { kind: 'matching', matches: [{ left: 'A', right: '1' }] })).toBe('A → 1')
    expect(correctText(matching, [{ left: 'A', right: '2' }])).toBe('A → 2')
    const form: ItemBody = { kind: 'form', fields: [{ id: 'f', label: 'Name' }] }
    expect(answerText(form, { kind: 'form', values: { f: 'Ann' } })).toBe('Name: Ann')
    expect(answerText(choice, null)).toBe('')
  })
})
