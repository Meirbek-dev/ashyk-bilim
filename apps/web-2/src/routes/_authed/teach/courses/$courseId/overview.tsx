import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'

import { CourseAnalysis } from '#/features/ai'
import { OverviewPage, readinessOptions } from '#/features/course-studio'
import { m } from '#/paraglide/messages'
import { ListSkeleton } from '#/shared/components/list-skeleton'

// Readiness, then the AI course analysis (slice 6.3) under it.
export const Route = createFileRoute('/_authed/teach/courses/$courseId/overview')({
  loader: ({ context, params }) =>
    context.queryClient.query({ ...readinessOptions(params.courseId), staleTime: 'static' }),
  staticData: { title: m.platform_tab_overview },
  component: function Overview() {
    return (
      <div className="flex flex-col gap-8">
        <OverviewPage />
        <Suspense fallback={<ListSkeleton />}>
          <CourseAnalysis courseId={Route.useParams().courseId} />
        </Suspense>
      </div>
    )
  },
})
