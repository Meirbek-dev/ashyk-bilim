import { linkOptions } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import type {
  DenyReason,
  LastMessage,
  Message,
  MessageContext,
  MessageId,
  Person,
  RecipientRole,
} from '#/shared/api/gen/types.gen'
import { formatDate, platformDay } from '#/shared/i18n/format'

/** Conversations per page of the list; messages per page of a feed (the server's defaults). */
export const CONVERSATIONS_PAGE = 20
export const MESSAGES_PAGE = 30
export const RECIPIENTS_PAGE = 20

/** The body's limit (contract `SendMessageRequest.body`) and where the counter starts (docs/DIALOGS.md 9). */
export const MAX_BODY = 4000
export const COUNTER_FROM = MAX_BODY - 200

/** Messages of one author this close together share one header (name, time). */
const GROUP_SECONDS = 5 * 60

/** Message ids are UUIDv7: their text order is the order they were written in. */
export const isAfter = (id: MessageId, other: MessageId | null) => other === null || id > other

/** The name to show: a deleted or disabled account is "Deleted user", never an empty line. */
export const personName = (person: Person) =>
  person.available ? person.display_name?.trim() || person.username : m.conversations_unavailable_person()

/** The line a deny reason stands for under the feed, in place of the composer (docs/DIALOGS.md 9). */
export const denyText: Record<DenyReason, () => string> = {
  no_relation: m.conversations_deny_no_relation,
  banned: m.conversations_deny_banned,
  peer_unavailable: m.conversations_deny_peer_unavailable,
}

export const roleLabels: Record<RecipientRole, () => string> = {
  teacher: m.conversations_role_teacher,
  observer: m.conversations_role_observer,
  learner: m.conversations_role_learner,
}

/** The list row's preview of the last message: "You: …" for one's own, the deleted mark for a tombstone. */
export function lastMessageText(last: LastMessage | null, viewer: string): string {
  if (!last) return m.conversations_no_messages()
  if (last.deleted) return m.conversations_deleted()
  // Files alone: «Файлы: 2» stands for the text.
  const text = last.excerpt || (last.files > 0 ? m.conversations_files_count({ count: last.files }) : '')
  return last.user_id === viewer ? m.conversations_you_said({ text }) : text
}

/** Where a message's context line leads: the activity in the player, else the course page. */
export function contextTarget(context: MessageContext) {
  return context.activity_id
    ? linkOptions({
        to: '/learn/$courseId/$activityId',
        params: { courseId: context.course_id, activityId: context.activity_id },
      })
    : linkOptions({ to: '/courses/$courseId', params: { courseId: context.course_id } })
}

/** The context line: the activity when there is one and it is visible, the course otherwise. */
export function contextText(context: MessageContext): string {
  if (context.activity_id && context.activity_name)
    return m.conversations_context_activity({ activity: context.activity_name })
  return context.course_name
    ? m.conversations_context_course({ course: context.course_name })
    : m.conversations_context_course_hidden()
}

export type FeedRow =
  | { kind: 'day'; key: string; label: string }
  | { kind: 'new'; key: string }
  | { kind: 'message'; key: string; message: Message; header: boolean; own: boolean }

/** A day divider's text: today, yesterday, else the date. */
function dayLabel(unixSeconds: number, now: number): string {
  const day = platformDay(unixSeconds)
  if (day === platformDay(now)) return m.conversations_today()
  if (day === platformDay(now - 86_400)) return m.conversations_yesterday()
  return formatDate(unixSeconds)
}

type FeedInput = {
  /** The pages as the server sends them: newest first within and across pages. */
  pages: readonly (readonly Message[])[]
  viewer: string
  /** The viewer's read pointer as the feed opened; messages after it are new. */
  lastRead: MessageId | null
  /** Unix seconds (today and yesterday). */
  now: number
}

/**
 * The feed oldest first (docs/DIALOGS.md 9): a divider per day, "New messages" before the first unread one from the
 * other person, and a header only where the author changes, a day starts or five minutes passed.
 */
export function buildFeed({ pages, viewer, lastRead, now }: FeedInput): FeedRow[] {
  const messages = pages.flat().toReversed()
  const rows: FeedRow[] = []
  let previous: Message | undefined
  let marked = false
  for (const message of messages) {
    const own = message.user_id === viewer
    const day = platformDay(message.created_at_unix)
    const newDay = !previous || platformDay(previous.created_at_unix) !== day
    if (newDay) rows.push({ kind: 'day', key: `day-${day}`, label: dayLabel(message.created_at_unix, now) })
    const fresh = !marked && !own && isAfter(message.id, lastRead)
    if (fresh) {
      marked = true
      rows.push({ kind: 'new', key: 'new' })
    }
    const header =
      newDay ||
      fresh ||
      previous?.user_id !== message.user_id ||
      message.created_at_unix - (previous?.created_at_unix ?? 0) > GROUP_SECONDS
    rows.push({ kind: 'message', key: message.id, message, header, own })
    previous = message
  }
  return rows
}

/** The newest message id of a feed (the pages are newest first): what reading the feed marks as read. */
export const newestId = (pages: readonly (readonly Message[])[]): MessageId | null => pages[0]?.[0]?.id ?? null

/** The opening of a text for a confirmation sentence: one line, at most `max` characters. */
export function excerpt(text: string, max = 80): string {
  const line = text.replaceAll(/\s+/g, ' ').trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}
