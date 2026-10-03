import { Suspense, useState } from 'react'

import { m } from '#/paraglide/messages'
import { Skeleton } from '#/shared/ui/skeleton'

import { HistoryList } from './history-list'

/**
 * The grading history, folded (B-GRD-17): read only when opened, so a grade save (which invalidates it) does not
 * refetch a list nobody looks at.
 */
export function HistorySection({ submissionId }: { submissionId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <details className="flex flex-col gap-2" onToggle={event => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-xl font-semibold">{m.grading_history()}</summary>
      {open ? (
        <Suspense fallback={<Skeleton className="h-16 w-full" />}>
          <HistoryList submissionId={submissionId} />
        </Suspense>
      ) : null}
    </details>
  )
}
