import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import { ApiError } from '#/shared/api/errors'
import type { AssessmentItem, AttemptState, ErrorCode, ItemBody, Policy } from '#/shared/api/gen/types.gen'

import { attemptSearchSchema } from '../route'
import { answerText, correctText } from './answer-text'
import {
  attemptGone,
  clock,
  clockEndsAt,
  DAY_SECONDS,
  entryAction,
  extraPrompt,
  gateCode,
  isBlank,
  needsRemediation,
  protections,
  asksTeacherForRetake,
  autoPart,
  resultVerdict,
  retryDelayMs,
  saveOutcome,
  runsToDueDate,
  saveStatus,
  secondsLeft,
  showsDueDate,
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
  assessment_version: 1,
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

  test('B-ATT-03 out of attempts, or past the due date after an attempt, leads to the teacher for a retake', () => {
    expect(asksTeacherForRetake(state({ can_start: false, disabled_reasons: ['MAX_ATTEMPTS_REACHED'] }))).toBe(true)
    const late = (attempts_used: number) => state({ can_start: false, disabled_reasons: ['PAST_DUE'], attempts_used })
    expect(asksTeacherForRetake(late(1))).toBe(true)
    expect(asksTeacherForRetake(late(0))).toBe(false)
  })

  test('B-ATT-23 a released score is passed or not against the effective passing score; nothing to judge otherwise', () => {
    const visible = { release_state: 'visible' as const }
    expect(resultVerdict({ ...visible, final_score: 60 }, state())).toBe('passed')
    expect(resultVerdict({ ...visible, final_score: 59.5 }, state())).toBe('not_passed')
    expect(resultVerdict({ ...visible, final_score: null }, state())).toBeNull()
    expect(resultVerdict({ release_state: 'awaiting_release', final_score: 90 }, state())).toBeNull()
    expect(resultVerdict({ release_state: 'returned_for_revision', final_score: 10 }, state())).toBeNull()
  })

  test('B-ATT-25 an attempt on manual review shows its auto-scored part, unless scores are hidden or the grade is out', () => {
    const pending = { status: 'pending' as const, final_score: null, auto_score: 40 }
    expect(autoPart(pending, 'full')).toBe(40)
    expect(autoPart(pending, 'none')).toBeNull()
    expect(autoPart({ ...pending, status: 'published', final_score: 70 }, 'full')).toBeNull()
    expect(autoPart({ ...pending, auto_score: null }, 'score_only')).toBeNull()
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

describe('attempt clock', () => {
  test('B-ATT-14 a due-date clock knows its end to the minute; a time limit is not a due date', () => {
    // 2026-03-01 12:00:00 UTC, answered 3 s before with 2 days and 2.6 s left.
    expect(clockEndsAt(172_802.6, 1_772_193_597_000)).toBe(1_772_366_400)
    expect(runsToDueDate('deadline_passed')).toBe(true)
    expect(runsToDueDate('time_expired')).toBe(false)
    expect(runsToDueDate(null)).toBe(false)
  })

  test('B-ATT-14 a due date reads «Сдать до» until its last day; the late cutoff counts down past the due date', () => {
    expect(showsDueDate('deadline_passed', DAY_SECONDS + 1)).toBe(true)
    expect(showsDueDate('deadline_passed', DAY_SECONDS)).toBe(false)
    expect(showsDueDate('late_cutoff_passed', 3 * DAY_SECONDS)).toBe(false)
    expect(runsToDueDate('late_cutoff_passed')).toBe(true)
    expect(showsDueDate('time_expired', 3 * DAY_SECONDS)).toBe(false)
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

  test('B-ATT-14 a skewed client clock does not move the deadline: only time elapsed since the answer counts', () => {
    // The same answer seen by a tab whose clock is 10 minutes ahead: both have 30 s left after 30 s.
    const skew = 600_000
    expect(secondsLeft(60, 1_000 + skew, 31_000 + skew)).toBe(secondsLeft(60, 1_000, 31_000))
  })

  test('B-ATT-12 B-ATT-13 B-ATT-15 a failed save says what to do next', () => {
    expect(saveOutcome(new TypeError('Failed to fetch'))).toBe('network')
    expect(saveOutcome(apiError(503, 'service-unavailable'))).toBe('network')
    expect(saveOutcome(apiError(409, 'conflict'))).toBe('conflict')
    expect(saveOutcome(apiError(429, 'rate-limited', 3))).toBe('throttled')
    expect(saveOutcome(apiError(403, 'forbidden'))).toBe('closed')
    expect(gateCode(apiError(403, 'attempt-past-due'))).toBe('attempt-past-due')
    expect(gateCode(apiError(403, 'forbidden'))).toBeNull()
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
    // The form's field order, not the stored (id-sorted) one.
    const two: ItemBody = {
      kind: 'form',
      fields: [
        { id: 'z', label: 'City' },
        { id: 'a', label: 'Age' },
      ],
    }
    expect(answerText(two, { kind: 'form', values: { a: '20', z: 'Astana' } })).toBe('City: Astana; Age: 20')
    expect(answerText(choice, null)).toBe('')
  })
})

const option = (text: string) => ({ id: text, text })

describe('complete answers', () => {
  test('B-ATT-16 a matching question needs every pair, a form every required field', () => {
    const matching: ItemBody = {
      kind: 'matching',
      left: ['a', 'b', 'c'].map(option),
      right: ['1', '2', '3'].map(option),
    }
    const two = {
      kind: 'matching' as const,
      matches: [
        { left: 'a', right: '1' },
        { left: 'b', right: '2' },
      ],
    }
    expect(isBlank(two, matching)).toBe(true)
    expect(isBlank({ ...two, matches: [...two.matches, { left: 'c', right: '3' }] }, matching)).toBe(false)
    const form: ItemBody = {
      kind: 'form',
      prompt: '',
      fields: [
        { id: 'city', label: 'City', field_type: 'text', required: true },
        { id: 'age', label: 'Age', field_type: 'number', required: false },
      ],
    }
    expect(isBlank({ kind: 'form', values: { age: '20' } }, form)).toBe(true)
    expect(isBlank({ kind: 'form', values: { city: 'Astana' } }, form)).toBe(false)
  })
})

describe('attempt question view', () => {
  test('B-ATT-06 a question shows its wording once: the prompt only when it adds to the title', () => {
    const withPrompt = (title: string, prompt: string) => ({ ...item('q'), title, body: { ...choice, prompt } })
    expect(extraPrompt(withPrompt('Какой метод?', ' Какой метод? '))).toBeNull()
    expect(extraPrompt(withPrompt('сұрақ:', 'Иммерсивті технологияға жатады'))).toBe('Иммерсивті технологияға жатады')
    expect(extraPrompt(item('q'))).toBeNull()
  })
})

describe('archived course', () => {
  test('B-ATT-15 an archived course shuts saving and handing in for good: not «saved by someone else»', () => {
    expect(saveOutcome(apiError(409, 'course-archived'))).toBe('closed')
    expect(submitOutcome(apiError(409, 'course-archived'))).toBe('closed')
    expect(gateCode(apiError(409, 'course-archived'))).toBe('course-archived')
  })

  test('B-ATT-15 a 404 on the attempt means the test went from the course; other refusals do not', () => {
    expect(attemptGone(apiError(404, 'not-found'))).toBe(true)
    expect(attemptGone(apiError(403, 'forbidden'))).toBe(false)
    expect(attemptGone(new Error('offline'))).toBe(false)
  })
})
