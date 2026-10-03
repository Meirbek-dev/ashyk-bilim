import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import type { GradebookCell, GradebookPage } from '#/shared/api/gen/types.gen'

import { filterRows, gradebookColumns, gradebookRows, reviewTarget, waiting } from './gradebook'
import { gradebookSearchSchema } from '../route'

const user = (name: string) => ({ id: `u-${name}`, display_name: `Name ${name}`, username: name, email: '' })
const cell = (userId: string, activityId: string, extra: Partial<GradebookCell> = {}): GradebookCell => ({
  activity_id: activityId,
  assessment_id: 'as-1',
  attempt_id: null,
  attempt_number: 1,
  attempts: 1,
  due_at_override_unix: null,
  file_submission_id: null,
  final_score: 80,
  graded_at_unix: 1,
  is_late: false,
  pending_attempt: null,
  pending_attempt_id: null,
  pending_attempt_status: null,
  status: 'published',
  submission_id: 'sub-1',
  submitted_at_unix: 1,
  user_id: userId,
  ...extra,
})
const page = (names: string[], cells: GradebookCell[]): GradebookPage => ({
  assessments: [
    { activity_id: 'act-q', due_at_unix: null, id: 'as-1', kind: 'quiz', passing_score: 50, title: 'Quiz' },
  ],
  file_submissions: [{ activity_id: 'act-f', due_at_unix: null, id: 'fs-1', title: 'Essay' }],
  cells,
  users: names.map(user),
  next_cursor: null,
})

describe('gradebook', () => {
  test('B-GRD-19 columns are the graded activities of all loaded pages, once each', () => {
    const pages = [page(['a'], []), page(['b'], [])]
    expect(gradebookColumns(pages)).toEqual([
      { activityId: 'act-q', title: 'Quiz' },
      { activityId: 'act-f', title: 'Essay' },
    ])
  })

  test('B-GRD-19 a row holds each learner cell by activity; a cell leads to the pending attempt first (UX-123)', () => {
    const rows = gradebookRows([page(['a', 'b'], [cell('u-a', 'act-q'), cell('u-b', 'act-f', { attempt_id: 'att' })])])
    expect(rows.map(row => [row.user.username, [...row.cells.keys()]])).toEqual([
      ['a', ['act-q']],
      ['b', ['act-f']],
    ])
    expect(reviewTarget(cell('u', 'x'))).toBe('sub-1')
    expect(reviewTarget(cell('u', 'x', { pending_attempt_id: 'newer' }))).toBe('newer')
    expect(reviewTarget(cell('u', 'x', { submission_id: null, attempt_id: 'att' }))).toBe('att')
  })

  test('B-GRD-20 search and "has work to review" narrow the loaded learners; unknown URL values are dropped', () => {
    const rows = gradebookRows([
      page(['alice', 'bob'], [cell('u-alice', 'act-q'), cell('u-bob', 'act-q', { pending_attempt_id: 'p' })]),
    ])
    expect(filterRows(rows, { q: 'ALI', pending: undefined }).map(row => row.user.username)).toEqual(['alice'])
    expect(filterRows(rows, { q: undefined, pending: true }).map(row => row.user.username)).toEqual(['bob'])
    expect(waiting(cell('u', 'x', { status: 'pending' }))).toBe(true)
    expect(v.parse(gradebookSearchSchema, { q: ' ', pending: 'no' })).toEqual({ q: undefined, pending: undefined })
  })
})
