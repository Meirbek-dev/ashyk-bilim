import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import type { AssessmentItem, Attempt, TeacherSubmission } from '#/shared/api/gen/types.gen'

import {
  fileGradeForm,
  fileGradeRequest,
  fileGradeSchema,
  gradeForm,
  gradeFormSchema,
  gradeRequest,
} from './grade-form'

const item = (id: string, max: number): AssessmentItem => ({
  body: { kind: 'open_text', prompt: '', min_words: null, rubric: null },
  id,
  kind: 'open_text',
  max_score: max,
  metadata: { difficulty: null, estimated_minutes: null, section_label: null },
  position: 1,
  title: id,
})

const submission = (extra: Partial<TeacherSubmission> = {}): TeacherSubmission => ({
  allowed_actions: ['save', 'publish', 'return'],
  answers: {},
  assessment_id: 'as',
  attempt_number: 1,
  auto_score: null,
  auto_submit_reason: null,
  content_version: 1,
  duration_seconds: null,
  feedback: [],
  final_score: null,
  graded_at_unix: null,
  // A 3-item exam: shares of 100 are 33.33 each; item `b` was half right (16.665 of 33.33).
  grading: {
    feedback: 'Хорошо',
    items: [
      { item_id: 'a', max_score: 33.33, score: 33.33, correct: true, correct_answer: null, user_answer: null },
      { item_id: 'b', max_score: 33.33, score: 16.665, correct: null, correct_answer: null, user_answer: null },
    ],
  },
  id: 'sub',
  is_late: false,
  late_penalty_pct: 0,
  policy_version: 1,
  release_state: 'hidden',
  score_override: null,
  started_at_unix: null,
  status: 'pending',
  submitted_at_unix: 1,
  user: { id: 'u', display_name: 'U', username: 'u', email: '' },
  version: 3,
  violation_count: 0,
  violations: [],
  ...extra,
})

const items = [item('a', 1), item('b', 10), item('c', 5)]

describe('assessment grade form', () => {
  test('B-GRD-12 seeds item scores on the item scale at hundredths; an ungraded item is blank', () => {
    const form = gradeForm(submission(), items)
    expect(form.items.map(row => [row.item_id, row.score, row.max])).toEqual([
      ['a', '1', 1],
      ['b', '5', 10],
      ['c', '', 5],
    ])
    expect(form.feedback).toBe('Хорошо')
    expect(form.final_score).toBe('')
  })

  test('B-GRD-12 sends only the edited items; an untouched form sends no item grades', () => {
    const seed = gradeForm(submission(), items)
    expect(gradeRequest(seed, seed, 'save')).toEqual({ action: 'save', feedback: 'Хорошо' })
    const edited = { ...seed, items: seed.items.map(row => (row.item_id === 'c' ? { ...row, score: '2,5' } : row)) }
    expect(gradeRequest(edited, seed, 'publish').item_grades).toEqual([{ item_id: 'c', score: 2.5 }])
  })

  test('B-GRD-12 a score above the item maximum is a field error', () => {
    const seed = gradeForm(submission(), items)
    const bad = { ...seed, items: seed.items.map(row => ({ ...row, score: '11' })) }
    const issues = v.safeParse(gradeFormSchema, bad).issues ?? []
    expect(issues.map(issue => v.getDotPath(issue))).toEqual(['items.0.score', 'items.1.score', 'items.2.score'])
  })

  test('B-GRD-13 the override is omitted when untouched, a number when typed, null when cleared (BUG-174)', () => {
    const stored = gradeForm(submission({ score_override: 72.456 }), items)
    expect(stored.final_score).toBe('72.46')
    expect(gradeRequest(stored, stored, 'save')).not.toHaveProperty('final_score')
    expect(gradeRequest({ ...stored, final_score: '' }, stored, 'save').final_score).toBeNull()
    expect(gradeRequest({ ...stored, final_score: '90' }, stored, 'save').final_score).toBe(90)
    expect(v.safeParse(gradeFormSchema, { ...stored, final_score: '120' }).success).toBe(false)
  })
})

const attempt = (extra: Partial<Attempt> = {}): Attempt => ({
  allowed_actions: ['save', 'publish'],
  attempt_number: 1,
  created_at_unix: 1,
  feedback: null,
  files: [],
  final_score: 45,
  graded_at_unix: null,
  id: 'att',
  is_late: true,
  late_penalty_pct: 10,
  raw_score: 50,
  rubric_scores: { criteria: [{ criterion_id: 'k1', label: 'Ясность', max_score: 10, score: 7 }] },
  started_at_unix: null,
  status: 'submitted',
  submitted_at_unix: 1,
  updated_at_unix: 1,
  user: null,
  version: 2,
  ...extra,
})

describe('file grade form', () => {
  const rubric = {
    criteria: [
      { criterion_id: 'k1', label: 'Ясность', max_score: 10 },
      { criterion_id: 'k2', label: 'Источники', max_score: 5 },
    ],
  }

  test('B-GRD-16 seeds the score before the late penalty and the rubric points', () => {
    const form = fileGradeForm(attempt(), rubric)
    expect(form.final_score).toBe('50')
    expect(form.criteria.map(row => [row.criterion_id, row.score])).toEqual([
      ['k1', '7'],
      ['k2', ''],
    ])
  })

  test('B-GRD-16 the request carries the score, the feedback and the scored criteria only', () => {
    const form = { ...fileGradeForm(attempt(), rubric), feedback: 'Ок' }
    expect(fileGradeRequest(form, 'publish')).toEqual({
      action: 'publish',
      feedback: 'Ок',
      final_score: 50,
      rubric_scores: { criteria: [{ criterion_id: 'k1', label: 'Ясность', max_score: 10, score: 7 }] },
    })
    const plain = fileGradeForm(attempt({ raw_score: null, rubric_scores: null }), {})
    expect(fileGradeRequest(plain, 'return')).toEqual({ action: 'return', feedback: '' })
    const over = { ...form, criteria: form.criteria.map(row => ({ ...row, score: '99' })) }
    expect(v.safeParse(fileGradeSchema, over).success).toBe(false)
  })
})
