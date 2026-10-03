import { m } from '#/paraglide/messages'
import { StatusBadge } from '#/shared/components/status-badge'

/** An activity is a draft until published (the word forms differ from the course's badge in ru and kk). */
export function ActivityStatusBadge({ published }: { published: boolean }) {
  return published ? (
    <StatusBadge tone="success">{m.studio_activity_status_published()}</StatusBadge>
  ) : (
    <StatusBadge tone="warning">{m.studio_status_draft()}</StatusBadge>
  )
}
