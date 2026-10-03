import type { InfiniteData } from '@tanstack/react-query'
import { linkOptions } from '@tanstack/react-router'

import type {
  Notification,
  NotificationId,
  NotificationPage,
  NotificationPayload,
  NotificationType,
} from '#/shared/api/gen/types.gen'

export const PAGE_SIZE = 20
/** How many of the newest the bell's panel shows. */
export const LATEST = 5

/** Every type, in the order the settings list them. */
export const NOTIFICATION_TYPES = [
  'grade_published',
  'submission_returned',
  'deadline_approaching',
  'deadline_extended',
  'course_update',
  'discussion_reply',
  'contributor_application',
] as const satisfies readonly NotificationType[]

/** The badge text: up to 99, then "99+". */
export const badgeCount = (count: number, format: (value: number) => string) =>
  count > 99 ? `${format(99)}+` : format(count)

/**
 * Where a notification leads, from the ids of its payload (B-NOT-05): the learner's activity (a file task's hand-in
 * page), the course updates, the discussion with its thread open, the course team.
 */
export function notificationTarget(payload: NotificationPayload) {
  const course = { courseId: payload.course_id }
  switch (payload.type) {
    case 'grade_published':
    case 'submission_returned':
      return payload.attempt_id
        ? linkOptions({
            to: '/learn/$courseId/$activityId/submission',
            params: { ...course, activityId: payload.activity_id },
          })
        : linkOptions({ to: '/learn/$courseId/$activityId', params: { ...course, activityId: payload.activity_id } })
    case 'deadline_approaching':
    case 'deadline_extended':
      return linkOptions({ to: '/learn/$courseId/$activityId', params: { ...course, activityId: payload.activity_id } })
    case 'course_update':
      return linkOptions({ to: '/courses/$courseId/updates', params: course })
    case 'discussion_reply':
      return linkOptions({
        to: '/courses/$courseId/discussions',
        params: course,
        search: { thread: payload.discussion_id },
      })
    case 'contributor_application':
      return linkOptions({ to: '/teach/courses/$courseId/team', params: course })
  }
  // A type this build does not know yet (a newer server): the list itself.
  return linkOptions({ to: '/notifications' })
}

type Pages = InfiniteData<NotificationPage> | undefined

const inAny = (data: NonNullable<Pages>, id: NotificationId) =>
  data.pages.some(page => page.items.some(item => item.id === id))

/** `notification.created`: the new one goes first, once (B-NOT-07). */
export function prependNotification(data: Pages, notification: Notification): Pages {
  if (!data || inAny(data, notification.id)) return data
  const [first, ...rest] = data.pages
  if (!first) return data
  return { ...data, pages: [{ ...first, items: [notification, ...first.items] }, ...rest] }
}

/** One notification (or all, `id` null) read at `at` (unix seconds); read ones keep their time (B-NOT-06, B-NOT-08). */
export function markRead(data: Pages, id: NotificationId | null, at: number): Pages {
  if (!data) return data
  const read = (item: Notification): Notification =>
    item.read_at_unix === null && (id === null || item.id === id) ? { ...item, read_at_unix: at } : item
  return { ...data, pages: data.pages.map(page => ({ ...page, items: page.items.map(read) })) }
}
