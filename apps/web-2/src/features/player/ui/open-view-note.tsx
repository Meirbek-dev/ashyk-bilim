import { Globe } from 'lucide-react'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { Alert, AlertDescription } from '#/shared/ui/alert'

import { OpenViewEnroll } from './open-view-enroll'

/**
 * Over every activity of an open view (`openView`): the course reads without an account, and what enrolling adds.
 * One quiet line above the heading, as the preview and archive notes.
 */
export function OpenViewNote({ courseId }: { courseId: CourseId }) {
  return (
    <Alert className="rounded-md border-0 bg-muted/60 px-3 py-2">
      <Globe aria-hidden />
      <AlertDescription>
        <span className="font-medium text-foreground">{m.player_open_title()}</span> <span>{m.player_open_text()}</span>{' '}
        <OpenViewEnroll courseId={courseId} inline />
      </AlertDescription>
    </Alert>
  )
}
