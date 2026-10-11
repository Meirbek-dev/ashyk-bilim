import { Eye } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { Alert, AlertDescription, AlertTitle } from '#/shared/ui/alert'

/** Over a page staff open as a learner: what a preview is (the page's back link leads to the studio). */
export function PreviewNote() {
  return (
    <Alert>
      <Eye aria-hidden />
      <AlertTitle>{m.player_preview_title()}</AlertTitle>
      <AlertDescription>{m.player_preview_text()}</AlertDescription>
    </Alert>
  )
}
