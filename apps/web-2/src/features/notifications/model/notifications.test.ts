import type { InfiniteData } from '@tanstack/react-query'
import { expect, expectTypeOf, test } from 'vite-plus/test'

import type { Notification, NotificationPage, NotificationPayload, NotificationType } from '#/shared/api/gen/types.gen'

import { badgeCount, markRead, NOTIFICATION_TYPES, notificationTarget, prependNotification } from './notifications'

const COURSE = '0190a5d2-0000-7000-8000-00000000000c'
const ACTIVITY = '0190a5d2-0000-7000-8000-00000000000a'
const names = { course_id: COURSE, course_name: 'Алгебра' }

const notification = (id: string, read_at_unix: number | null = null): Notification => ({
  id,
  type: 'course_update',
  payload: { ...names, type: 'course_update', title: 'Новости', update_id: '0190a5d2-0000-7000-8000-000000000011' },
  created_at_unix: 1_700_000_000,
  read_at_unix,
})
const pages = (...lists: Notification[][]): InfiniteData<NotificationPage> => ({
  pages: lists.map((items, index) => ({ items, next_cursor: index < lists.length - 1 ? `c${index}` : null })),
  pageParams: lists.map((_, index) => (index === 0 ? undefined : `c${index - 1}`)),
})
const ids = (data: InfiniteData<NotificationPage> | undefined) =>
  data?.pages.map(page => page.items.map(item => `${item.id}${item.read_at_unix === null ? '*' : ''}`))

test('B-NOT-01 the badge counts up to 99, then "99+"', () => {
  expect(badgeCount(7, String)).toBe('7')
  expect(badgeCount(99, String)).toBe('99')
  expect(badgeCount(140, String)).toBe('99+')
})

test('B-NOT-05 each type leads to its own place, built from the payload ids', () => {
  const activity = { ...names, activity_id: ACTIVITY, activity_name: 'Тест' }
  const graded: NotificationPayload = {
    ...activity,
    type: 'grade_published',
    final_score: 90,
    submission_id: null,
    attempt_id: null,
  }
  expect(notificationTarget(graded)).toEqual({
    to: '/learn/$courseId/$activityId',
    params: { courseId: COURSE, activityId: ACTIVITY },
  })
  const returned: NotificationPayload = {
    ...activity,
    type: 'submission_returned',
    submission_id: null,
    attempt_id: '0190a5d2-0000-7000-8000-00000000000e',
  }
  expect(notificationTarget(returned).to).toBe('/learn/$courseId/$activityId/submission')
  expect(notificationTarget({ ...activity, type: 'deadline_approaching', due_at_unix: 1 }).to).toBe(
    '/learn/$courseId/$activityId',
  )
  expect(notificationTarget(notification('n').payload)).toEqual({
    to: '/courses/$courseId/updates',
    params: { courseId: COURSE },
  })
  const thread = '0190a5d2-0000-7000-8000-000000000012'
  expect(
    notificationTarget({
      ...names,
      type: 'discussion_reply',
      discussion_id: thread,
      reply_id: '0190a5d2-0000-7000-8000-000000000013',
      author_id: '0190a5d2-0000-7000-8000-000000000014',
      author_name: 'Аня',
    }),
  ).toEqual({ to: '/courses/$courseId/discussions', params: { courseId: COURSE }, search: { thread } })
  expect(
    notificationTarget({
      ...names,
      type: 'contributor_application',
      applicant_id: '0190a5d2-0000-7000-8000-000000000015',
      applicant_name: 'Бек',
    }).to,
  ).toBe('/teach/courses/$courseId/team')
})

test('B-NOT-07 a new notification goes first, once; an empty cache stays empty', () => {
  const data = pages([notification('b'), notification('a', 5)], [notification('z', 5)])
  const once = prependNotification(data, notification('c'))
  expect(ids(once)).toEqual([['c*', 'b*', 'a'], ['z']])
  expect(ids(prependNotification(once, notification('c')))).toEqual([['c*', 'b*', 'a'], ['z']])
  expect(prependNotification(undefined, notification('c'))).toBeUndefined()
})

test('B-NOT-08 a read marks one notification, or all of them, and keeps earlier read times', () => {
  const data = pages([notification('b'), notification('a', 5)], [notification('z')])
  expect(ids(markRead(data, 'b', 9))).toEqual([['b', 'a'], ['z*']])
  const all = markRead(data, null, 9)
  expect(ids(all)).toEqual([['b', 'a'], ['z']])
  expect(all?.pages[0]?.items[1]?.read_at_unix).toBe(5)
})

test('B-NOT-09 the settings list every notification type once', () => {
  expectTypeOf<(typeof NOTIFICATION_TYPES)[number]>().toEqualTypeOf<NotificationType>()
  expect(new Set(NOTIFICATION_TYPES).size).toBe(NOTIFICATION_TYPES.length)
})
