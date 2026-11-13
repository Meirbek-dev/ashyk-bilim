import { Eye } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { Alert, AlertDescription } from '#/shared/ui/alert'

/**
 * Over a page staff open as a learner: what a preview is (the page's back link leads to the studio). A lesson has no
 * attempts to try out, only the learner's mark that staff do not get. One quiet line above the activity's own heading:
 * it speaks of the screen, not of the lesson, and must not stand between a title and its text.
 */
export function PreviewNote({ lesson = false }: { lesson?: boolean }) {
  return (
    <Alert className="rounded-md border-0 bg-muted/60 px-3 py-2">
      <Eye aria-hidden />
      <AlertDescription>
        <span className="font-medium text-foreground">{m.player_preview_title()}</span>{' '}
        <span>{lesson ? m.player_preview_lesson() : m.player_preview_text()}</span>
      </AlertDescription>
    </Alert>
  )
}
