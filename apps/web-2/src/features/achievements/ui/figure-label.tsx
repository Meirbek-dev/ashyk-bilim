import type { ReactNode } from 'react'

/**
 * A figure's label that is also its region's heading: small and quiet, in the UI face. The weight sits on the inner
 * span because headings take theirs from an unlayered rule (globals.css) that a utility on the `h2` cannot override.
 */
export function FigureLabel({ children }: { children: ReactNode }) {
  return (
    <h2 className="font-sans text-sm text-muted-foreground">
      <span className="font-normal">{children}</span>
    </h2>
  )
}

/** One cell of the figures line: label, figure, then its note at the foot, level with its neighbours'. */
export const figureCell = 'flex min-w-0 flex-col gap-2'
export const figureValue = 'font-heading text-2xl font-semibold tabular-nums'
export const figureNote = 'mt-auto text-sm text-pretty text-muted-foreground tabular-nums'
