import { CatchBoundary } from '@tanstack/react-router'
import { Suspense } from 'react'

import type { CourseId } from '#/shared/api/gen/types.gen'
import { ListSkeleton } from '#/shared/components/list-skeleton'

import { CourseAnalysisBody } from './course-analysis-body'
import { PanelError } from './panel-error'

/** The course analysis on the course workspace's `overview` (B-AI-13): its failures stay in this section. */
export function CourseAnalysis({ courseId }: { courseId: CourseId }) {
  return (
    <CatchBoundary getResetKey={() => courseId} errorComponent={PanelError}>
      <Suspense fallback={<ListSkeleton />}>
        <CourseAnalysisBody courseId={courseId} />
      </Suspense>
    </CatchBoundary>
  )
}
