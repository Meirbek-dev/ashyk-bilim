import { useSuspenseQuery } from '@tanstack/react-query'
import { CatchBoundary } from '@tanstack/react-router'
import { Suspense } from 'react'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { hasCapability } from '#/shared/auth/access'
import { sessionOptions } from '#/shared/auth/session'
import { Skeleton } from '#/shared/ui/skeleton'

import { CoursePulseTiles } from './course-pulse-tiles'

/**
 * `overview`'s «Course right now» for a caller with analytics (B-CST-47): learners, active this week, average progress,
 * work awaiting review. It is a glance, not the page's job: a failure (a course outside the analytics scope) hides it.
 */
export function CoursePulse({ courseId }: { courseId: CourseId }) {
  const { data: session } = useSuspenseQuery(sessionOptions())
  if (!hasCapability(session, 'analytics.view')) return null
  return (
    <section aria-labelledby="course-pulse" className="flex flex-col gap-4">
      <h2 id="course-pulse" className="text-xl font-semibold">
        {m.studio_pulse_title()}
      </h2>
      <CatchBoundary getResetKey={() => courseId} errorComponent={() => null}>
        <Suspense
          fallback={
            <div className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
              {[0, 1, 2, 3].map(key => (
                <Skeleton key={key} className="h-28 rounded-xl" />
              ))}
            </div>
          }
        >
          <CoursePulseTiles courseId={courseId} />
        </Suspense>
      </CatchBoundary>
    </section>
  )
}
