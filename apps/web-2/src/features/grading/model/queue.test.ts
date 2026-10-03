import * as v from 'valibot'
import { describe, expect, test } from 'vite-plus/test'

import type { FileReviewItem, FileReviewStats, ReviewItem, Stats } from '#/shared/api/gen/types.gen'

import {
  activeFilters,
  assessmentQuery,
  extendOutcome,
  extensionTargets,
  fileQuery,
  neighbours,
  nextQueueCursor,
  returnable,
  sortSearch,
  statusCounts,
  tableSort,
  workKind,
} from './queue'
import { queueSearchSchema } from '../route'

const user = (name: string) => ({ id: `u-${name}`, display_name: name, username: name, email: `${name}@e2e.test` })
const row = (id: string, extra: Partial<ReviewItem> = {}): ReviewItem => ({
  allowed_actions: ['save', 'publish'],
  attempt_number: 1,
  auto_score: null,
  enrolled: true,
  final_score: null,
  graded_at_unix: null,
  id,
  is_late: false,
  staff: false,
  status: 'pending',
  submitted_at_unix: 1,
  user: user(id),
  version: 1,
  ...extra,
})
const fileRow = (id: string): FileReviewItem => ({
  allowed_actions: ['return'],
  attempt_number: 1,
  enrolled: true,
  file_count: 1,
  final_score: null,
  graded_at_unix: null,
  id,
  is_late: false,
  staff: false,
  status: 'submitted',
  submitted_at_unix: 1,
  user: user(id),
  version: 1,
})

describe('queue', () => {
  test('B-GRD-01 quizzes, exams and code are assessment work, a file submission is file work, the rest has none', () => {
    expect([workKind('quiz'), workKind('exam'), workKind('code_challenge')]).toEqual(Array(3).fill('assessment'))
    expect(workKind('file_submission')).toBe('file')
    expect(workKind('dynamic')).toBeNull()
    expect(workKind('video')).toBeNull()
  })

  test('B-GRD-02 the URL keeps known filters and drops unknown values', () => {
    expect(v.parse(queueSearchSchema, { status: 'graded', q: '  ali ', late: true })).toEqual({
      status: 'graded',
      q: 'ali',
      late: true,
      group: undefined,
      sort: undefined,
      order: undefined,
    })
    const junk = v.parse(queueSearchSchema, { status: 'weird', late: 'yes', q: '   ', sort: 'name', group: 'g1' })
    expect(junk).toEqual({
      status: undefined,
      q: undefined,
      late: undefined,
      group: undefined,
      sort: undefined,
      order: undefined,
    })
    expect(activeFilters(junk)).toBe(0)
    expect(activeFilters({ ...junk, status: 'returned', q: 'x' })).toBe(2)
  })

  test('B-GRD-02 the filters go to the server; the file queue calls "needs grading" submitted', () => {
    const search = v.parse(queueSearchSchema, { status: 'needs_grading', q: 'ali', late: true })
    expect(assessmentQuery(search)).toEqual({ limit: 50, status: 'needs_grading', search: 'ali', late_only: true })
    expect(fileQuery(search)).toEqual({ limit: 50, status: 'submitted', search: 'ali', late_only: true })
  })

  test('B-GRD-03 a header sort goes to the URL and to the server; no sort is the server default', () => {
    const none = v.parse(queueSearchSchema, {})
    expect(tableSort(none)).toBeUndefined()
    expect(assessmentQuery(none)).toEqual({ limit: 50 })
    const sorted = { ...none, ...sortSearch({ id: 'final_score', desc: false }) }
    expect(sorted).toMatchObject({ sort: 'final_score', order: 'asc' })
    expect(tableSort(sorted)).toEqual({ id: 'final_score', desc: false })
    expect(assessmentQuery(sorted)).toMatchObject({ sort: 'final_score', order: 'asc' })
    expect(sortSearch(undefined)).toEqual({ sort: undefined, order: undefined })
    expect(sortSearch({ id: 'learner', desc: true })).toEqual({ sort: undefined, order: undefined })
  })

  test('B-GRD-04 the next page is asked with next_cursor and stops without one', () => {
    expect(nextQueueCursor({ items: [], next_cursor: 'abc' })).toBe('abc')
    expect(nextQueueCursor({ items: [], next_cursor: null })).toBeUndefined()
  })

  test('B-GRD-05 the status counts are the server stats', () => {
    const stats: Stats = {
      avg_score: null,
      distribution: [],
      graded: 2,
      late: 1,
      needs_grading: 3,
      pass_rate: null,
      published: 4,
      returned: 5,
      total: 14,
    }
    expect(statusCounts(stats)).toEqual({ needs_grading: 3, graded: 2, published: 4, returned: 5 })
  })
})

describe('group and file counts', () => {
  test('B-GRD-24 the group filter goes to both queues and counts as a filter', () => {
    const group = '0190f3f4-6b1c-7a00-8000-000000000001'
    const search = v.parse(queueSearchSchema, { group })
    expect(assessmentQuery(search)).toEqual({ limit: 50, group_id: group })
    expect(fileQuery(search)).toEqual({ limit: 50, group_id: group })
    expect(activeFilters(search)).toBe(1)
  })

  test('B-GRD-25 the file queue counts come from its stats; "needs grading" is submitted', () => {
    const stats: FileReviewStats = { graded: 2, late: 1, published: 4, returned: 5, submitted: 3, total: 14 }
    expect(statusCounts(stats)).toEqual({ needs_grading: 3, graded: 2, published: 4, returned: 5 })
  })
})

describe('bulk and walking', () => {
  test('B-GRD-08 only rows the server lets the caller return are returned', () => {
    const rows = [row('a', { allowed_actions: ['save', 'return'] }), row('b'), fileRow('c')]
    expect(returnable(rows).map(item => item.id)).toEqual(['a', 'c'])
  })

  test('B-GRD-09 an extension targets course members once each and names leavers and staff', () => {
    const rows = [row('a'), row('a2', { user: user('a') }), row('b', { enrolled: false }), row('c', { staff: true })]
    expect(extensionTargets(rows)).toEqual({ ids: ['u-a'], skipped: ['b', 'c'] })
  })

  test('B-GRD-25 a file row is extended under the same rule', () => {
    expect(extensionTargets([fileRow('a'), { ...fileRow('b'), staff: true }])).toEqual({ ids: ['u-a'], skipped: ['b'] })
  })

  test('B-GRD-27 an assessment extension settles when the worker completes or fails it', () => {
    expect(extendOutcome({ status: 'completed', affected_count: 2 })).toEqual({ state: 'done', count: 2 })
    expect(extendOutcome({ status: 'failed', affected_count: 0 })).toEqual({ state: 'failed', count: 0 })
    expect(extendOutcome({ status: 'pending', affected_count: 0 }).state).toBe('queued')
    expect(extendOutcome({ status: 'running', affected_count: 0 }).state).toBe('queued')
  })

  test('B-GRD-10 prev and next walk the loaded queue', () => {
    expect(neighbours(['a', 'b', 'c'], 'b')).toEqual({ prev: 'a', next: 'c' })
    expect(neighbours(['a', 'b'], 'a')).toEqual({ next: 'b' })
    expect(neighbours(['a'], 'a')).toEqual({})
    expect(neighbours(['a'], 'zz')).toEqual({})
  })
})
