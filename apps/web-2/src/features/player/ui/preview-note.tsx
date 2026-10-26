import { Eye } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { Alert, AlertDescription, AlertTitle } from '#/shared/ui/alert'

/**
 * Over a page staff open as a learner: what a preview is (the page's back link leads to the studio). A lesson has no
 * attempts to try out, only the learner's mark that staff do not get.
 */
export function PreviewNote({ lesson = false }: { lesson?: boolean }) {
  return (
    <Alert>
      <Eye aria-hidden />
      <AlertTitle>{m.player_preview_title()}</AlertTitle>
      <AlertDescription>{lesson ? m.player_preview_lesson() : m.player_preview_text()}</AlertDescription>
    </Alert>
  )
}
