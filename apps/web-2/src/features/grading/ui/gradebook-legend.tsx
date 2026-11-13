import { ChevronRight } from 'lucide-react'

import { m } from '#/paraglide/messages'

/**
 * The gradebook's footnote: how the total is counted, one click away under the table (three lines of rules above every
 * visit pushed the table down for a teacher who knows them). The course average stands in the table's last row.
 */
export function GradebookLegend() {
  return (
    <details className="group max-w-prose text-sm text-muted-foreground">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded-sm transition-colors duration-150 hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 transition-transform duration-150 group-open:rotate-90" />
        {m.grading_total_how()}
      </summary>
      <p className="ps-5 pt-1 text-pretty">{m.grading_total_legend()}</p>
    </details>
  )
}
