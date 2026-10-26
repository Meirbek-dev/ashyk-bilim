import { Archive } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { Alert, AlertDescription, AlertTitle } from '#/shared/ui/alert'

/** Over every activity of an archived course: it reads as before, but nothing more is started, handed in or marked. */
export function ArchivedNote() {
  return (
    <Alert>
      <Archive aria-hidden />
      <AlertTitle>{m.player_archived_title()}</AlertTitle>
      <AlertDescription>{m.player_archived_text()}</AlertDescription>
    </Alert>
  )
}
