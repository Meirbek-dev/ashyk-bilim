import { describe, expect, test } from 'vite-plus/test'

import type { AssessmentItem, CodeBody, StudentSubmission } from '#/shared/api/gen/types.gen'

import { answerOf, codeItemOf, draftOf, initialAnswer, switchLanguage, testsPassed, upsertAttempt } from './arena'
import { caseVerdict } from './verdict'

const body: CodeBody = {
  languages: [71, 63],
  starter_code: { '71': 'print()', '63': 'console.log()' },
  max_output_kb: null,
  memory_limit_mb: 256,
  time_limit_seconds: 5,
}

const attempt = (patch: Partial<StudentSubmission>): StudentSubmission => ({
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
  total_items: 1,
  violation_count: 0,
  ...patch,
})

const item = (languages: number[]): AssessmentItem => ({
  id: 'i1',
  kind: 'code',
  title: 'Sum',
  position: 1,
  max_score: 100,
  metadata: { difficulty: null, estimated_minutes: null, section_label: null },
  body: { ...body, languages, kind: 'code' },
})

describe('code arena model', () => {
  test('B-COD-02 a challenge without a code item or without languages is not set up', () => {
    expect(codeItemOf(null)).toBeNull()
    expect(codeItemOf({ items: [] })).toBeNull()
    expect(codeItemOf({ items: [item([])] })).toBeNull()
    expect(codeItemOf({ items: [item([71])] })?.item.id).toBe('i1')
  })

  test('B-COD-05 the editor starts with the draft code, else the first language starter', () => {
    expect(initialAnswer(body, null)).toEqual({ language: 71, source: 'print()' })
    expect(initialAnswer(body, { language: 63, source: 'x' })).toEqual({ language: 63, source: 'x' })
    // A draft in a language the author removed falls back to the starter.
    expect(initialAnswer(body, { language: 50, source: 'int main' })).toEqual({ language: 71, source: 'print()' })
    const draft = attempt({ answers: { i1: { kind: 'code', language: 63, source: 'y' } } })
    expect(answerOf(draft, 'i1')).toEqual({ language: 63, source: 'y' })
    expect(answerOf(draft, 'other')).toBeNull()
  })

  test('B-COD-05 switching language replaces untouched code and keeps the learner own', () => {
    expect(switchLanguage(body, { language: 71, source: 'print()' }, 63)).toEqual({
      language: 63,
      source: 'console.log()',
    })
    expect(switchLanguage(body, { language: 71, source: '  ' }, 63).source).toBe('console.log()')
    expect(switchLanguage(body, { language: 71, source: 'print(1)' }, 63)).toEqual({ language: 63, source: 'print(1)' })
  })

  test('B-COD-08 a test verdict comes from the Judge0 status id, not from its text', () => {
    expect(caseVerdict({ passed: true, status_id: 3 })).toBe('accepted')
    expect(caseVerdict({ passed: false, status_id: 3 })).toBe('wrong_answer')
    expect(caseVerdict({ passed: false, status_id: 4 })).toBe('wrong_answer')
    expect(caseVerdict({ passed: false, status_id: 5 })).toBe('time_limit')
    expect(caseVerdict({ passed: false, status_id: 6 })).toBe('compile_error')
    expect(caseVerdict({ passed: false, status_id: 11 })).toBe('runtime_error')
    expect(caseVerdict({ passed: false, status_id: 2 })).toBe('pending')
    expect(caseVerdict({ passed: false, status_id: 13 })).toBe('internal_error')
    expect(caseVerdict({ passed: false, status_id: null })).toBe('internal_error')
  })

  test('B-COD-10 a graded attempt tells how many tests passed', () => {
    const graded = attempt({
      status: 'published',
      grading: {
        items: [
          {
            item_id: 'i1',
            correct: false,
            correct_answer: null,
            max_score: 100,
            score: 50,
            user_answer: null,
            feedback_code: 'tests-passed',
            feedback_params: { correct: 1, total: 2 },
          },
        ],
      },
    })
    expect(testsPassed(graded)).toEqual({ correct: 1, total: 2 })
    expect(testsPassed(attempt({ grading: null }))).toBeNull()
  })

  test('B-COD-11 a write replaces its attempt in the history or leads it', () => {
    const first = attempt({ id: 's1', status: 'published' })
    const second = attempt({ id: 's2' })
    expect(upsertAttempt([first], second).map(row => row.id)).toEqual(['s2', 's1'])
    const sent = attempt({ id: 's2', status: 'pending' })
    expect(upsertAttempt([second, first], sent)[0]?.status).toBe('pending')
    expect(draftOf([first, second])?.id).toBe('s2')
  })
})
