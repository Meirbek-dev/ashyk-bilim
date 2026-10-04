import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import type { WorkItem, WorkKind } from '#/shared/api/gen/types.gen'

import { courseOptions, isInboxKind, nextWorkCursor, rowAction, submissionIdOf } from './inbox'
import { inboxSearchSchema } from '../route'

const COURSE_A = '7f0c1a2e-0000-4000-8000-00000000000a'
const COURSE_B = '7f0c1a2e-0000-4000-8000-00000000000b'
const SUBMISSION = '0d6c2f4a-1b2c-4d5e-8f90-a1b2c3d4e5f6'

function item(id: string, kind: WorkKind, courseId = COURSE_A): WorkItem {
  return {
    id,
    kind,
    role: 'teacher',
    status: 'needs_grading',
    priority: 'high',
    title: '',
    description: '',
    href: '',
    primary_action: '',
    course_id: courseId,
    course_title: courseId === COURSE_A ? 'Алгебра' : 'Физика',
    activity_id: id,
    activity_title: id,
    due_at_unix: null,
    created_at_unix: null,
    allowed_actions: [],
  }
}

describe('teach inbox model', () => {
  test('B-INB-02 the three teacher kinds are known; any other kind is not', () => {
    expect(['sla_breach', 'needs_grading', 'awaiting_release'].every(isInboxKind)).toBe(true)
    expect(isInboxKind('overdue')).toBe(false)
  })

  test('B-INB-03 the action comes from allowed_actions only, grading first', () => {
    expect(rowAction({ allowed_actions: ['grade', 'return', 'publish'] })).toBe('grade')
    expect(rowAction({ allowed_actions: ['review', 'publish'] })).toBe('review')
    expect(rowAction({ allowed_actions: ['publish'] })).toBeUndefined()
  })

  test('B-INB-03 the work behind a row is the submission or the file attempt, otherwise there is none', () => {
    expect(submissionIdOf({ submission_id: SUBMISSION })).toBe(SUBMISSION)
    expect(submissionIdOf({ attempt_id: SUBMISSION })).toBe(SUBMISSION)
    expect(submissionIdOf({})).toBeUndefined()
  })

  test('B-INB-04 B-INB-05 B-INB-10 the filters and order are URL values; an unknown one is the whole queue', () => {
    expect(v.parse(inboxSearchSchema, { kind: 'awaiting_release', course: COURSE_A, sort: 'due' })).toEqual({
      kind: 'awaiting_release',
      course: COURSE_A,
      sort: 'due',
    })
    expect(v.parse(inboxSearchSchema, { kind: 'overdue', course: 'not-an-id', sort: 'name' })).toEqual({
      kind: undefined,
      course: undefined,
      sort: undefined,
    })
    expect(v.parse(inboxSearchSchema, {})).toEqual({})
  })

  test('B-INB-05 the course filter offers each loaded course once, first appearance first', () => {
    const items = [item('1', 'sla_breach', COURSE_B), item('2', 'needs_grading'), item('3', 'needs_grading', COURSE_B)]
    expect(courseOptions(items)).toEqual([
      { id: COURSE_B, title: 'Физика' },
      { id: COURSE_A, title: 'Алгебра' },
    ])
  })

  test('B-INB-06 asks for the next page with next_cursor and stops when it is null', () => {
    expect(nextWorkCursor({ items: [], total: 3, next_cursor: 'abc' })).toBe('abc')
    expect(nextWorkCursor({ items: [], total: 3, next_cursor: null })).toBeUndefined()
  })
})
