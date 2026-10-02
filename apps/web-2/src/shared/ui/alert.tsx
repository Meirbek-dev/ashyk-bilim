import { CircleAlert } from 'lucide-react'
import type { ReactNode } from 'react'

/** An error that stays on the page (DESIGN 8: errors are inline, never a toast); announced when it appears. */
export function Alert({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-md border border-destructive/30 px-3 py-2 text-sm text-destructive"
    >
      <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </p>
  )
}
