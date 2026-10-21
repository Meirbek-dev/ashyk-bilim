import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import type { Activity, Curriculum, CurriculumChapter, GradebookCell, GradebookPage } from '#/shared/api/gen/types.gen'

import {
  gradebookColumns,
  gradebookQuery,
  gradebookRows,
  gradebookSummary,
  reviewTarget,
  waitingNote,
} from './gradebook'
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
    { activity_id: 'act-q', due_at_unix: null, id: 'as-1', kind: 'quiz', passing_score: 50, title: 'Quiz', weight: 1 },
  ],
  file_submissions: [{ activity_id: 'act-f', due_at_unix: null, id: 'fs-1', title: 'Essay' }],
  cells,
  users: names.map(user),
  totals: names.map(name => ({ user_id: `u-${name}`, score: 75, missing: 0 })),
  summary: null,
  next_cursor: null,
})

const activity = (id: string, position: number): Activity => ({
  id,
  course_id: 'c',
  chapter_id: 'ch',
  name: id,
  activity_type: 'quiz',
  activity_sub_type: 'quiz_standard',
  allowed_actions: [],
  position,
  published: true,
  version: 1,
})
const chapter = (ids: string[]): CurriculumChapter => ({
  id: ids.join(),
  course_id: 'c',
  name: 'Chapter',
  description: '',
  position: 1,
  version: 1,
  allowed_actions: [],
  activities: ids.map(activity),
})

describe('gradebook', () => {
  test('B-GRD-19 columns are the graded activities of all loaded pages, once each', () => {
    const pages = [page(['a'], []), page(['b'], [])]
    expect(gradebookColumns(pages)).toEqual([
      { activityId: 'act-q', title: 'Quiz' },
      { activityId: 'act-f', title: 'Essay' },
    ])
  })

  test('B-GRD-19 columns follow the course program, not tests first and hand-ins after', () => {
    const curriculum: Curriculum = { chapters: [chapter(['act-page', 'act-f']), chapter(['act-q'])] }
    expect(gradebookColumns([page(['a'], [])], curriculum).map(column => column.activityId)).toEqual(['act-f', 'act-q'])
    // An activity the program no longer lists stays, after the rest.
    expect(gradebookColumns([page(['a'], [])], { chapters: [chapter(['act-q'])] }).map(c => c.activityId)).toEqual([
      'act-q',
      'act-f',
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

  test('B-GRD-37 each row carries its course total; the average row comes from the first page only', () => {
    const first = { ...page(['a'], []), summary: { columns: [], course_average: 75 } }
    const rows = gradebookRows([first, page(['b'], [])])
    expect(rows.map(row => row.total?.score)).toEqual([75, 75])
    expect(gradebookSummary([first, page(['b'], [])])?.course_average).toBe(75)
    expect(gradebookSummary([])).toBe(null)
  })

  test('B-GRD-19 a newer waiting attempt is noted; the shown attempt waiting is not', () => {
    expect(
      waitingNote(cell('u', 'x', { status: 'graded', pending_attempt: 1, pending_attempt_status: 'graded' })),
    ).toBe(null)
    expect(
      waitingNote(cell('u', 'x', { attempt_number: 1, pending_attempt: 2, pending_attempt_status: 'pending' })),
    ).toBe('grade')
    expect(
      waitingNote(cell('u', 'x', { attempt_number: 1, pending_attempt: 2, pending_attempt_status: 'graded' })),
    ).toBe('release')
  })

  test('B-GRD-20 search and "has work to review" go to the server; unknown URL values are dropped', () => {
    const search = v.parse(gradebookSearchSchema, { q: ' ali ', pending: true })
    expect(gradebookQuery(search)).toEqual({ limit: 100, q: 'ali', status: 'needs_grading' })
    const junk = v.parse(gradebookSearchSchema, { q: ' ', pending: 'no', group: 'x' })
    expect(junk).toEqual({ q: undefined, pending: undefined, group: undefined })
    expect(gradebookQuery(junk)).toEqual({ limit: 100 })
  })

  test('B-GRD-24 the group in the URL filters the gradebook on the server', () => {
    const group = '0190f3f4-6b1c-7a00-8000-000000000001'
    expect(gradebookQuery(v.parse(gradebookSearchSchema, { group }))).toEqual({ limit: 100, group_id: group })
  })
})
