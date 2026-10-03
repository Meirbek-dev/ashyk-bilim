import { createFileRoute } from '@tanstack/react-router'

import { CourseAnalysis } from '#/features/ai'
import { OverviewPage, readinessOptions } from '#/features/course-studio'
import { m } from '#/paraglide/messages'

// Readiness, then the AI course analysis (slice 6.3) under it.
export const Route = createFileRoute('/_authed/teach/courses/$courseId/overview')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(readinessOptions(params.courseId)),
  staticData: { title: m.platform_tab_overview },
  component: function Overview() {
    return (
      <div className="flex flex-col gap-gutter">
        <OverviewPage />
        <CourseAnalysis courseId={Route.useParams().courseId} />
      </div>
    )
  },
})
