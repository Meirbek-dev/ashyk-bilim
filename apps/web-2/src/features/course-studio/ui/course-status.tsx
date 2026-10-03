import { m } from '#/paraglide/messages'
import { StatusBadge } from '#/shared/components/status-badge'

import type { CourseStatus } from '../model/course'

/** DESIGN 3: published = success, draft = warning, archived = neutral; always with its label. */
const courseStatusMeta = {
  draft: { label: m.studio_status_draft, tone: 'warning' },
  published: { label: m.studio_status_published, tone: 'success' },
  archived: { label: m.studio_status_archived, tone: 'neutral' },
} as const satisfies Record<CourseStatus, { label: () => string; tone: 'warning' | 'success' | 'neutral' }>

export function CourseStatusBadge({ status }: { status: CourseStatus }) {
  const meta = courseStatusMeta[status]
  return <StatusBadge tone={meta.tone}>{meta.label()}</StatusBadge>
}
