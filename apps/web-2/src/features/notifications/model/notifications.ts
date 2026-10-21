import type { InfiniteData } from '@tanstack/react-query'
import { linkOptions } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type {
  Notification,
  NotificationId,
  NotificationPage,
  NotificationPayload,
  NotificationType,
  XpAwarded,
} from '#/shared/api/gen/types.gen'
import { formatNumber } from '#/shared/i18n/format'

export const PAGE_SIZE = 20

/** A row of a list: a notification and the ids of the older unread replies of its thread folded into it. */
export type NotificationRow = { notification: Notification; folded: NotificationId[] }

/**
 * Unread replies in one thread fold into the newest (CONTRACT-REQ-E-1): one «3 новых ответа» row, not three alike.
 * The list is newest first; read rows and other types stay one row each.
 */
export function foldThreadReplies(items: readonly Notification[]): NotificationRow[] {
  const rows: NotificationRow[] = []
  const threads = new Map<string, NotificationRow>()
  for (const notification of items) {
    const { payload } = notification
    const thread =
      payload.type === 'discussion_reply' && notification.read_at_unix === null ? payload.discussion_id : null
    const open = thread === null ? undefined : threads.get(thread)
    if (open) {
      open.folded.push(notification.id)
      continue
    }
    const row: NotificationRow = { notification, folded: [] }
    if (thread !== null) threads.set(thread, row)
    rows.push(row)
  }
  return rows
}
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
  'discussion_post',
  'course_team_added',
] as const satisfies readonly NotificationType[]

/** Types only course staff receive (applications, new threads, team changes): a learner's settings leave them out. */
const STAFF_TYPES = new Set<NotificationType>(['contributor_application', 'discussion_post', 'course_team_added'])

/** The switches a user sees (B-NOT-09): staff-only types need the teach capability. */
export const preferenceTypes = (teaches: boolean) =>
  NOTIFICATION_TYPES.filter(type => teaches || !STAFF_TYPES.has(type))

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
    case 'discussion_post':
      return linkOptions({
        to: '/courses/$courseId/discussions',
        params: course,
        search: { thread: payload.discussion_id },
      })
    case 'contributor_application':
      return linkOptions({ to: '/teach/courses/$courseId/team', params: course })
    case 'course_team_added':
      // An observer has no workspace (no `teach` space): the course page, which shows them drafts too.
      return payload.role === 'reporter'
        ? linkOptions({ to: '/courses/$courseId', params: course })
        : linkOptions({ to: '/teach/courses/$courseId/overview', params: course })
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

/** "+N XP", and "Level N!" when the award lifted the level above the one known before it (B-NOT-10, B-NOT-17). */
export function xpAwardToasts(award: Pick<XpAwarded, 'amount' | 'level'>, previousLevel: number | null): string[] {
  const titles = [m.notifications_xp_awarded({ amount: formatNumber(award.amount) })]
  if (previousLevel !== null && award.level > previousLevel)
    titles.push(m.notifications_level_up({ level: formatNumber(award.level) }))
  return titles
}
