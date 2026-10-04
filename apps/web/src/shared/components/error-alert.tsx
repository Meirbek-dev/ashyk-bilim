import { CircleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

import { Alert } from '#/shared/ui/alert'

/** An error that stays on the page (DESIGN 8: errors are inline, never a toast); announced when it appears. */
export function ErrorAlert({ children }: { children: ReactNode }) {
  return (
    // On the page, not on a card, and in full destructive ink: the stock description dims it to /90, which falls
    // below 4.5:1 in several dark themes (G-15).
    <Alert variant="destructive" className="bg-transparent">
      <CircleAlert aria-hidden />
      <div>{children}</div>
    </Alert>
  )
}
