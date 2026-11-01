import { CatchBoundary } from '@tanstack/react-router'
import { Suspense } from 'react'

import type { CourseId } from '#/shared/api/gen/types.gen'

import { CourseSearchBox } from './course-search-box'

/**
 * «Search the course material» (B-CON-12) under «My concepts», and like it a secondary block: it waits for nothing and
 * says nothing when the AI capabilities that decide whether it shows cannot load.
 */
export function CourseSearch({ courseId }: { courseId: CourseId }) {
  return (
    <CatchBoundary getResetKey={() => courseId} errorComponent={() => null}>
      <Suspense fallback={null}>
        <CourseSearchBox courseId={courseId} />
      </Suspense>
    </CatchBoundary>
  )
}
