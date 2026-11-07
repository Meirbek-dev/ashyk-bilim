import { Archive } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { Alert, AlertDescription, AlertTitle } from '#/shared/ui/alert'

/** Over every activity of an archived course: it reads as before, but nothing more is started, handed in or marked. */
export function ArchivedNote() {
  return (
    <Alert className="rounded-none border-0 border-s-2 bg-transparent py-0 ps-4">
      <Archive aria-hidden />
      <AlertTitle>{m.player_archived_title()}</AlertTitle>
      <AlertDescription>{m.player_archived_text()}</AlertDescription>
    </Alert>
  )
}
