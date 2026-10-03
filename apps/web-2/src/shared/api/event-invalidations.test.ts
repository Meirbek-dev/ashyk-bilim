import { partialMatchKey } from '@tanstack/react-query'
import { expect, expectTypeOf, test } from 'vite-plus/test'

import { eventInvalidations, type EventType, invalidationsFor } from './event-invalidations'
import {
  agendaQueryKey,
  assessmentReviewQueueInfiniteQueryKey,
  attemptStateQueryKey,
  dashboardQueryKey,
  getSubmissionQueryKey,
  getTrailInfiniteQueryKey,
  gradebookInfiniteQueryKey,
  learnerCourseStateQueryKey,
  myAttemptsQueryKey,
  reviewSubmissionQueryKey,
  statsQueryKey,
  unreadCountQueryKey,
  workQueueInfiniteQueryKey,
} from './gen/@tanstack/react-query.gen'

const COURSE = '0190a5d2-0000-7000-8000-00000000000c'
const OTHER_COURSE = '0190a5d2-0000-7000-8000-00000000000d'
const ACTIVITY = '0190a5d2-0000-7000-8000-00000000000a'
const SUBMISSION = '0190a5d2-0000-7000-8000-00000000000b'
const ATTEMPT = '0190a5d2-0000-7000-8000-00000000000e'
const work = { course_id: COURSE, activity_id: ACTIVITY, status: 'published' as const, final_score: 80 }

/** Whether any of the keys would invalidate this cached query (the Query prefix rule). */
const hits = (keys: readonly (readonly unknown[])[], cached: readonly unknown[]) =>
  keys.some(key => partialMatchKey(cached, key))

test('B-NOT-12 every contract event has a row (a missing one does not compile)', () => {
  expectTypeOf<keyof typeof eventInvalidations>().toEqualTypeOf<EventType>()
  expect(Object.keys(eventInvalidations).toSorted()).toEqual([
    'grading.updated',
    'notification.created',
    'notification.read',
    'submission.updated',
    'xp.awarded',
  ])
})

test('B-NOT-12 a grading change refreshes the queues, that course gradebook and the submission', () => {
  const keys = invalidationsFor('grading.updated', {
    ...work,
    user_id: '0190a5d2-0000-7000-8000-000000000001',
    submission_id: SUBMISSION,
    attempt_id: null,
  })
  expect(hits(keys, workQueueInfiniteQueryKey({ query: { role: 'teacher' } }))).toBe(true)
  expect(hits(keys, assessmentReviewQueueInfiniteQueryKey({ path: { assessment_id: 'any' }, query: {} }))).toBe(true)
  expect(hits(keys, gradebookInfiniteQueryKey({ path: { course_id: COURSE } }))).toBe(true)
  expect(hits(keys, gradebookInfiniteQueryKey({ path: { course_id: OTHER_COURSE } }))).toBe(false)
  expect(hits(keys, getSubmissionQueryKey({ path: { submission_id: SUBMISSION } }))).toBe(true)
  expect(hits(keys, reviewSubmissionQueryKey({ path: { submission_id: SUBMISSION } }))).toBe(true)
  expect(hits(keys, statsQueryKey({ path: { assessment_id: 'any' } }))).toBe(true)
})

test("B-NOT-12 the learner's own submission refreshes progress, the trail, Today and the task's attempts", () => {
  const keys = invalidationsFor('submission.updated', { ...work, submission_id: null, attempt_id: ATTEMPT })
  expect(hits(keys, learnerCourseStateQueryKey({ path: { course_id: COURSE } }))).toBe(true)
  expect(hits(keys, getTrailInfiniteQueryKey({ query: { limit: 20 } }))).toBe(true)
  expect(hits(keys, agendaQueryKey({ query: { days: 14 } }))).toBe(true)
  expect(hits(keys, myAttemptsQueryKey({ path: { file_submission_id: 'any' } }))).toBe(true)
  expect(hits(keys, attemptStateQueryKey({ path: { assessment_id: 'any' } }))).toBe(true)
  expect(hits(keys, getSubmissionQueryKey({ path: { submission_id: SUBMISSION } }))).toBe(false)
})

test('B-NOT-12 XP refreshes the achievements; notification events refetch nothing (they carry the change)', () => {
  const xp = invalidationsFor('xp.awarded', {
    transaction_id: '0190a5d2-0000-7000-8000-00000000000f',
    amount: 10,
    reason: null,
    source: 'activity_completion',
    total_xp: 110,
    level: 2,
  })
  expect(hits(xp, dashboardQueryKey())).toBe(true)
  const read = invalidationsFor('notification.read', { notification_id: null, unread_count: 0 })
  expect(hits(read, unreadCountQueryKey())).toBe(false)
})
