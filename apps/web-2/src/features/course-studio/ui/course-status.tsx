import { m } from '#/paraglide/messages'

import type { CourseStatus } from '../model/course'

const courseStatusMeta = {
  draft: { label: m.studio_status_draft },
  published: { label: m.studio_status_published },
  archived: { label: m.studio_status_archived },
} as const satisfies Record<CourseStatus, { label: () => string }>

/**
 * The status as a word in a meta line (DESIGN 9): published is a course's usual state and takes the line's own ink, so
 * the one draft, in full ink, stands out; a row of green tags said less.
 */
export function CourseStatusText({ status }: { status: CourseStatus }) {
  const meta = courseStatusMeta[status]
  return <span className={status === 'draft' ? undefined : 'text-muted-foreground'}>{meta.label()}</span>
}
