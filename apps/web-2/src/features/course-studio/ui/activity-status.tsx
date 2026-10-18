import { m } from '#/paraglide/messages'
import { StatusBadge } from '#/shared/components/status-badge'

/**
 * An activity is a draft until published (the word forms differ from the course's badge in ru and kk). Published is
 * the program's usual state: said to screen readers only, so the drafts stand out (DESIGN 9).
 */
export function ActivityStatusBadge({ published }: { published: boolean }) {
  return published ? (
    <span className="sr-only">{m.studio_activity_status_published()}</span>
  ) : (
    <StatusBadge tone="warning">{m.studio_status_draft()}</StatusBadge>
  )
}
