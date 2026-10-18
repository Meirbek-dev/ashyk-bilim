import { Suspense, useState } from 'react'

import { m } from '#/paraglide/messages'
import { Skeleton } from '#/shared/ui/skeleton'

import type { Work } from '../queries'
import { Fold } from './fold'
import { HistoryList } from './history-list'

/**
 * The grading history, folded (B-GRD-17, B-GRD-26): read only when opened, so a grade save (which invalidates it)
 * does not refetch a list nobody looks at.
 */
export function HistorySection({ work, submissionId }: { work: Work; submissionId: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Fold title={m.grading_history()} onToggle={setOpen}>
      {open ? (
        <Suspense fallback={<Skeleton className="h-16 w-full" />}>
          <HistoryList work={work} id={submissionId} />
        </Suspense>
      ) : null}
    </Fold>
  )
}
