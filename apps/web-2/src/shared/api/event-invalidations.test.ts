import { partialMatchKey } from '@tanstack/react-query'
import { expect, expectTypeOf, test } from 'vite-plus/test'

import { aboutOtherActivity, eventInvalidations, type EventType, invalidationsFor } from './event-invalidations'
import {
  agendaQueryKey,
  assessmentReviewQueueInfiniteQueryKey,
  attemptStateQueryKey,
  dashboardQueryKey,
  getActivityFileSubmissionQueryKey,
  getSubmissionQueryKey,
  listEnrollmentsInfiniteQueryKey,
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
    'admin.updated',
    'collection.updated',
    'deadline.extended',
    'discussion.updated',
    'grading.updated',
    'notification.created',
    'notification.read',
    'progress.updated',
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
  expect(hits(keys, listEnrollmentsInfiniteQueryKey({ query: { limit: 20 } }))).toBe(true)
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

test('B-NOT-12 an extended due date refreshes the course plan, "Today" and that activity', () => {
  const keys = invalidationsFor('deadline.extended', {
    course_id: COURSE,
    activity_id: ACTIVITY,
    due_at_unix: 1,
    assessment_id: null,
    file_submission_id: null,
  })
  expect(hits(keys, learnerCourseStateQueryKey({ path: { course_id: COURSE } }))).toBe(true)
  expect(hits(keys, learnerCourseStateQueryKey({ path: { course_id: OTHER_COURSE } }))).toBe(false)
  expect(hits(keys, getActivityFileSubmissionQueryKey({ path: { activity_id: ACTIVITY } }))).toBe(true)
})

test('B-NOT-15 a task-keyed read of another activity is left alone; an unknown task counts as the event’s', () => {
  const assessment = '0190a5d2-0000-7000-8000-0000000000f1'
  const queue = statsQueryKey({ path: { assessment_id: assessment } })
  const read = (activity: string) => [{ id: assessment, activity_id: activity }, null, 'text']
  expect(aboutOtherActivity(queue, ACTIVITY, read(ACTIVITY))).toBe(false)
  expect(aboutOtherActivity(queue, ACTIVITY, read('0190a5d2-0000-7000-8000-0000000000f2'))).toBe(true)
  expect(aboutOtherActivity(queue, ACTIVITY, [])).toBe(false)
  // Not keyed by a task: never narrowed.
  expect(aboutOtherActivity(gradebookInfiniteQueryKey({ path: { course_id: COURSE } }), ACTIVITY, read('x'))).toBe(
    false,
  )
})
