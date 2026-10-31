import { CatchBoundary } from '@tanstack/react-router'
import { Suspense } from 'react'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { ListSkeleton } from '#/shared/components/list-skeleton'

import { ClassMap } from './class-map'
import { ClassMapError } from './class-map-error'

/** The class mastery map under the concepts (B-CON-09): its failure (the feature off) stays in this section. */
export function ClassMapSection({ courseId }: { courseId: CourseId }) {
  return (
    <section aria-labelledby="class-map" className="@container flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="class-map" className="text-xl font-semibold">
          {m.concepts_class_title()}
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground">{m.concepts_class_intro()}</p>
      </div>
      <CatchBoundary getResetKey={() => courseId} errorComponent={ClassMapError}>
        <Suspense fallback={<ListSkeleton />}>
          <ClassMap courseId={courseId} />
        </Suspense>
      </CatchBoundary>
    </section>
  )
}
