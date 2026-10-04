import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import type { WorkItem } from '#/shared/api/gen/types.gen'

import { courseOptions, filterItems, isInboxKind, nextWorkCursor, rowAction, submissionIdOf } from './inbox'
import { inboxSearchSchema } from '../route'

const COURSE_A = '7f0c1a2e-0000-4000-8000-00000000000a'
const COURSE_B = '7f0c1a2e-0000-4000-8000-00000000000b'
const SUBMISSION = '0d6c2f4a-1b2c-4d5e-8f90-a1b2c3d4e5f6'

function item(id: string, kind: string, courseId = COURSE_A): WorkItem {
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

  test('B-INB-03 the submission id is read from the server href in either link map, otherwise there is none', () => {
    const legacy = '/dash/courses/c/activity/a/review'
    expect(submissionIdOf({ href: `${legacy}?submission=${SUBMISSION}` })).toBe(SUBMISSION)
    expect(submissionIdOf({ href: `${legacy}?tab=1&submission=${SUBMISSION}#top` })).toBe(SUBMISSION)
    expect(submissionIdOf({ href: legacy })).toBeUndefined()
    expect(submissionIdOf({ href: `${legacy}?submission=${SUBMISSION}x` })).toBeUndefined()
    const v2 = '/teach/courses/c/activities/a/submissions'
    expect(submissionIdOf({ href: `${v2}/${SUBMISSION}` })).toBe(SUBMISSION)
    expect(submissionIdOf({ href: `https://ashyq.test${v2}/${SUBMISSION}?x=1` })).toBe(SUBMISSION)
    expect(submissionIdOf({ href: v2 })).toBeUndefined()
    expect(submissionIdOf({ href: `${v2}/${SUBMISSION}x` })).toBeUndefined()
  })

  test('B-INB-04 B-INB-05 the filters are URL values; an unknown one is the whole queue', () => {
    expect(v.parse(inboxSearchSchema, { kind: 'awaiting_release', course: COURSE_A })).toEqual({
      kind: 'awaiting_release',
      course: COURSE_A,
    })
    expect(v.parse(inboxSearchSchema, { kind: 'overdue', course: 'not-an-id' })).toEqual({
      kind: undefined,
      course: undefined,
    })
    expect(v.parse(inboxSearchSchema, {})).toEqual({})
  })

  test('B-INB-04 B-INB-05 the filters narrow the loaded rows and keep the server order', () => {
    const items = [item('1', 'sla_breach'), item('2', 'needs_grading', COURSE_B), item('3', 'needs_grading')]
    expect(filterItems(items, {}).map(row => row.id)).toEqual(['1', '2', '3'])
    expect(filterItems(items, { kind: 'needs_grading' }).map(row => row.id)).toEqual(['2', '3'])
    expect(filterItems(items, { kind: 'needs_grading', course: COURSE_A }).map(row => row.id)).toEqual(['3'])
    expect(filterItems(items, { kind: 'awaiting_release' })).toEqual([])
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
