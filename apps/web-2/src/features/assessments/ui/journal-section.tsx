import { Suspense, useState } from 'react'

import { m } from '#/paraglide/messages'
import type { CourseLearner } from '#/shared/api/gen/types.gen'
import { Button } from '#/shared/ui/button'
import { Skeleton } from '#/shared/ui/skeleton'

import { JournalList } from './journal-list'

/** "Log": read on demand (the events grow with every attempt; the page does not need them to work). */
export function JournalSection({
  assessmentId,
  learners,
}: {
  assessmentId: string
  learners: readonly CourseLearner[]
}) {
  const [shown, setShown] = useState(false)
  return (
    <section aria-labelledby="journal-title" className="flex max-w-prose flex-col items-start gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="journal-title" className="text-xl font-semibold">
          {m.assessments_nav_journal()}
        </h2>
        <p className="text-sm text-muted-foreground">{m.assessments_journal_hint()}</p>
      </div>
      {shown ? (
        <div className="w-full">
          <Suspense fallback={<Skeleton className="h-row w-full" />}>
            <JournalList assessmentId={assessmentId} learners={learners} />
          </Suspense>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setShown(true)}>
          {m.assessments_journal_show()}
        </Button>
      )}
    </section>
  )
}
