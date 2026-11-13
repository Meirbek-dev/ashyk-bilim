import { Archive } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { Alert, AlertDescription } from '#/shared/ui/alert'

/** Over every activity of an archived course: it reads as before, but nothing more is started, handed in or marked. */
export function ArchivedNote() {
  return (
    <Alert className="rounded-md border-0 bg-muted/60 px-3 py-2">
      <Archive aria-hidden />
      <AlertDescription>
        <span className="font-medium text-foreground">{m.player_archived_title()}</span>{' '}
        <span>{m.player_archived_text()}</span>
      </AlertDescription>
    </Alert>
  )
}
