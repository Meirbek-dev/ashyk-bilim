import {
  AlarmClock,
  Award,
  CalendarPlus,
  Megaphone,
  MessageSquareReply,
  Undo2,
  UserPlus,
  type LucideIcon,
} from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { NotificationPayload, NotificationType } from '#/shared/api/gen/types.gen'
import { formatDateTime, formatNumber } from '#/shared/i18n/format'

/** The type's name: the item's heading and the settings switch (B-NOT-04, B-NOT-09). */
export const notificationTypeLabels: Record<NotificationType, () => string> = {
  grade_published: m.notifications_type_grade_published,
  submission_returned: m.notifications_type_submission_returned,
  deadline_extended: m.notifications_type_deadline_extended,
  deadline_approaching: m.notifications_type_deadline_approaching,
  course_update: m.notifications_type_course_update,
  discussion_reply: m.notifications_type_discussion_reply,
  contributor_application: m.notifications_type_contributor_application,
}

export const notificationIcons: Record<NotificationType, LucideIcon> = {
  grade_published: Award,
  submission_returned: Undo2,
  deadline_extended: CalendarPlus,
  deadline_approaching: AlarmClock,
  course_update: Megaphone,
  discussion_reply: MessageSquareReply,
  contributor_application: UserPlus,
}

/** What happened, with the names the payload carries: one or two lines. */
export function notificationLines(payload: NotificationPayload): string[] {
  switch (payload.type) {
    case 'grade_published': {
      const what = m.notifications_text_activity({ activity: payload.activity_name, course: payload.course_name })
      return payload.final_score === null
        ? [what]
        : [what, m.notifications_text_score({ score: formatNumber(payload.final_score) })]
    }
    case 'submission_returned':
      return [m.notifications_text_activity({ activity: payload.activity_name, course: payload.course_name })]
    case 'deadline_approaching':
    case 'deadline_extended':
      return [
        m.notifications_text_activity({ activity: payload.activity_name, course: payload.course_name }),
        m.notifications_text_due({ date: formatDateTime(payload.due_at_unix) }),
      ]
    case 'course_update':
      return [m.notifications_text_update({ title: payload.title, course: payload.course_name })]
    case 'discussion_reply':
      return [m.notifications_text_reply({ author: payload.author_name, course: payload.course_name })]
    case 'contributor_application':
      return [m.notifications_text_application({ applicant: payload.applicant_name, course: payload.course_name })]
  }
  return []
}
