import { CatchBoundary } from '@tanstack/react-router'
import { Suspense } from 'react'

import type { CourseId } from '#/shared/api/gen/types.gen'

import { MyConceptsList } from './my-concepts-list'

/**
 * «My concepts» on an enrolled learner's course page (B-CON-11). A secondary block: it waits for nothing and says
 * nothing when it cannot load (the feature off answers `ai-disabled`), so the page around it never breaks.
 */
export function MyConcepts({ courseId }: { courseId: CourseId }) {
  return (
    <CatchBoundary getResetKey={() => courseId} errorComponent={() => null}>
      <Suspense fallback={null}>
        <MyConceptsList courseId={courseId} />
      </Suspense>
    </CatchBoundary>
  )
}
