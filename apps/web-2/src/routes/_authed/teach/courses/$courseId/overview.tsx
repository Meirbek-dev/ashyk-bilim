import { createFileRoute } from '@tanstack/react-router'

import { OverviewPage, readinessOptions } from '#/features/course-studio'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/teach/courses/$courseId/overview')({
  loader: ({ context, params }) => context.queryClient.ensureQueryData(readinessOptions(params.courseId)),
  staticData: { title: m.platform_tab_overview },
  component: OverviewPage,
})
