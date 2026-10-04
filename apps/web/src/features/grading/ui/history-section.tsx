import { Suspense, useState } from 'react'

import { m } from '#/paraglide/messages'
import { Skeleton } from '#/shared/ui/skeleton'

import type { Work } from '../queries'
import { HistoryList } from './history-list'

/**
 * The grading history, folded (B-GRD-17, B-GRD-26): read only when opened, so a grade save (which invalidates it)
 * does not refetch a list nobody looks at.
 */
export function HistorySection({ work, submissionId }: { work: Work; submissionId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <details className="flex flex-col gap-2" onToggle={event => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-xl font-semibold">{m.grading_history()}</summary>
      {open ? (
        <Suspense fallback={<Skeleton className="h-16 w-full" />}>
          <HistoryList work={work} id={submissionId} />
        </Suspense>
      ) : null}
    </details>
  )
}
