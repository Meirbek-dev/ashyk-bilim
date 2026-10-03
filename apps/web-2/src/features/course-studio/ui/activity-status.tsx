import { m } from '#/paraglide/messages'
import { Badge } from '#/shared/ui/badge'

/** An activity is a draft until published (the word forms differ from the course's badge in ru and kk). */
export function ActivityStatusBadge({ published }: { published: boolean }) {
  return published ? (
    <Badge tone="success">{m.studio_activity_status_published()}</Badge>
  ) : (
    <Badge tone="warning">{m.studio_status_draft()}</Badge>
  )
}
