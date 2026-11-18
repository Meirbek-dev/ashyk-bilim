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
  showsInline,
  appendDraft,
  unscoredManual,
} from './grade-form'

const item = (id: string, max: number): AssessmentItem => ({
  body: { kind: 'open_text', prompt: '', min_words: null, rubric: null },
  id,
  kind: 'open_text',
  max_score: max,
  metadata: { difficulty: null, estimated_minutes: null, section_label: null, draw_group: null },
  position: 1,
  title: id,
  assessment_version: 1,
})

const submission = (extra: Partial<TeacherSubmission> = {}): TeacherSubmission => ({
  allowed_actions: ['save', 'publish', 'return'],
  answers: {},
  assessment_id: 'as',
  attempt_number: 1,
  auto_points: null,
  auto_score: null,
  auto_submit_reason: null,
  content_version: 1,
  duration_seconds: null,
  feedback: [],
  final_points: null,
  final_score: null,
  graded_at_unix: null,
  // A 16-point exam in its version's points: item `b` was half right (5 of 10).
  grading: {
    feedback: 'Хорошо',
    items: [
      { item_id: 'a', max_score: 1, score: 1, correct: true, correct_answer: null, user_answer: null },
      { item_id: 'b', max_score: 10, score: 5, correct: null, correct_answer: null, user_answer: null },
    ],
  },
  id: 'sub',
  is_late: false,
  late_penalty_pct: 0,
  max_points: 16,
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
    expect(form.final_points).toBe('')
    expect(form.max_points).toBe(16)
  })

  test('B-GRD-15 an answer awaiting manual review is blank, not its placeholder 0, and blocks publishing until scored', () => {
    const awaiting = submission({
      grading: {
        items: [
          { item_id: 'a', max_score: 1, score: 1, correct: true, correct_answer: null, user_answer: null },
          {
            item_id: 'b',
            max_score: 10,
            score: 0,
            needs_manual_review: true,
            correct: null,
            correct_answer: null,
            user_answer: null,
          },
        ],
      },
    })
    const seed = gradeForm(awaiting, items)
    expect(seed.items.map(row => row.score)).toEqual(['1', '', ''])
    expect(unscoredManual(seed, awaiting)).toEqual([2])
    const scored = { ...seed, items: seed.items.map(row => (row.item_id === 'b' ? { ...row, score: '0' } : row)) }
    expect(unscoredManual(scored, awaiting)).toEqual([])
    expect(gradeRequest(seed, seed, 'save')).not.toHaveProperty('item_grades')
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
    const stored = gradeForm(submission({ score_override: 7.456 }), items)
    expect(stored.final_points).toBe('7.46')
    expect(gradeRequest(stored, stored, 'save')).not.toHaveProperty('final_points')
    expect(gradeRequest({ ...stored, final_points: '' }, stored, 'save').final_points).toBeNull()
    expect(gradeRequest({ ...stored, final_points: '9,5' }, stored, 'save').final_points).toBe(9.5)
    expect(gradeRequest({ ...stored, final_points: '16' }, stored, 'save').final_points).toBe(16)
  })

  test('B-GRD-13 the override is points of the attempt: above its maximum is a field error', () => {
    const stored = gradeForm(submission(), items)
    const issues = v.safeParse(gradeFormSchema, { ...stored, final_points: '16.01' }).issues ?? []
    expect(issues.map(issue => v.getDotPath(issue))).toEqual(['final_points'])
    expect(v.safeParse(gradeFormSchema, { ...stored, final_points: '-1' }).success).toBe(false)
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

describe('B-GRD-28 file preview types', () => {
  test('B-GRD-28 only images (not SVG) and PDFs are shown inline; the rest is downloaded', () => {
    for (const type of ['image/png', 'image/JPEG', 'application/pdf', 'application/pdf; charset=binary']) {
      expect(showsInline(type)).toBe(true)
    }
    for (const type of ['text/html', 'image/svg+xml', 'IMAGE/SVG+XML', 'application/xml', 'text/plain', '']) {
      expect(showsInline(type)).toBe(false)
    }
  })
})

test('B-GRD-31 a feedback draft goes under what is written; an empty field takes it as is', () => {
  expect(appendDraft('', 'Черновик')).toBe('Черновик')
  expect(appendDraft('  ', 'Черновик')).toBe('Черновик')
  expect(appendDraft('Молодец. ', 'Черновик')).toBe('Молодец.\n\nЧерновик')
  expect(appendDraft('Молодец.\n\nЧерновик', 'Черновик')).toBe('Молодец.\n\nЧерновик')
})
