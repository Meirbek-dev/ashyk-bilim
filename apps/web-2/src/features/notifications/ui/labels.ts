import {
  AlarmClock,
  Award,
  CalendarPlus,
  ClipboardCheck,
  Megaphone,
  MessageSquarePlus,
  MessageSquareReply,
  Undo2,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { NotificationPayload, NotificationType } from '#/shared/api/gen/types.gen'
import { formatDateTime, formatPercent } from '#/shared/i18n/format'

/** The type's name: the item's heading and the settings switch (B-NOT-04, B-NOT-09). */
export const notificationTypeLabels: Record<NotificationType, () => string> = {
  grade_published: m.notifications_type_grade_published,
  submission_returned: m.notifications_type_submission_returned,
  deadline_extended: m.notifications_type_deadline_extended,
  deadline_approaching: m.notifications_type_deadline_approaching,
  course_update: m.notifications_type_course_update,
  discussion_reply: m.notifications_type_discussion_reply,
  contributor_application: m.notifications_type_contributor_application,
  discussion_post: m.notifications_type_discussion_post,
  course_team_added: m.notifications_type_course_team_added,
  work_submitted: m.notifications_type_work_submitted,
}

export const notificationIcons: Record<NotificationType, LucideIcon> = {
  grade_published: Award,
  submission_returned: Undo2,
  deadline_extended: CalendarPlus,
  deadline_approaching: AlarmClock,
  course_update: Megaphone,
  discussion_reply: MessageSquareReply,
  contributor_application: UserPlus,
  discussion_post: MessageSquarePlus,
  course_team_added: Users,
  work_submitted: ClipboardCheck,
}

/** The empty list says what will arrive: a teacher also hears of hand-ins and new threads (B-NOT-02). */
export const emptyListText = (teaches: boolean) => (teaches ? m.notifications_empty_teach() : m.notifications_empty())

const excerpt = (text: string | undefined) => (text ? [m.notifications_text_excerpt({ text })] : [])

/** What happened, with the names the payload carries: one or two lines; `replies` folded into one row of a thread. */
export function notificationLines(payload: NotificationPayload, replies = 1): string[] {
  switch (payload.type) {
    // The teacher's words travel with the grade (CONTRACT-REQ-G-2): the score and the feedback share line two.
    case 'grade_published': {
      const what = m.notifications_text_activity({ activity: payload.activity_name, course: payload.course_name })
      const score =
        payload.final_score === null ? [] : [m.notifications_text_score({ score: formatPercent(payload.final_score) })]
      const said = [...score, ...excerpt(payload.excerpt)].join(' · ')
      return said ? [what, said] : [what]
    }
    case 'submission_returned':
      return [
        m.notifications_text_activity({ activity: payload.activity_name, course: payload.course_name }),
        ...excerpt(payload.excerpt),
      ]
    case 'deadline_approaching':
    case 'deadline_extended':
      return [
        m.notifications_text_activity({ activity: payload.activity_name, course: payload.course_name }),
        m.notifications_text_due({ date: formatDateTime(payload.due_at_unix) }),
      ]
    case 'course_update':
      return [m.notifications_text_update({ title: payload.title, course: payload.course_name })]
    // The post's own words under who wrote where (CONTRACT-REQ-E-1): twenty replies no longer read alike.
    case 'discussion_reply':
      return [
        replies > 1
          ? m.notifications_text_replies({ count: replies, course: payload.course_name })
          : m.notifications_text_reply({ author: payload.author_name, course: payload.course_name }),
        ...excerpt(payload.excerpt),
      ]
    case 'contributor_application':
      return [m.notifications_text_application({ applicant: payload.applicant_name, course: payload.course_name })]
    case 'discussion_post':
      return [
        m.notifications_text_post({ author: payload.author_name, course: payload.course_name }),
        ...excerpt(payload.excerpt),
      ]
    case 'course_team_added':
      return [
        payload.role === 'reporter'
          ? m.notifications_text_team_observer({ course: payload.course_name })
          : m.notifications_text_team_added({ course: payload.course_name }),
      ]
    // One row per activity counts the hand-ins since it was read (B-NOT-18): who handed in last stays named.
    case 'work_submitted':
      return [
        m.notifications_text_activity({ activity: payload.activity_name, course: payload.course_name }),
        payload.count > 1
          ? m.notifications_text_works({ count: payload.count, learner: payload.learner_name })
          : m.notifications_text_work({ learner: payload.learner_name }),
      ]
  }
  return []
}
