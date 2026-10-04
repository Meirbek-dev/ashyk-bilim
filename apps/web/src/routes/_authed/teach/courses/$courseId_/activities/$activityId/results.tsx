import { createFileRoute } from '@tanstack/react-router'

import { ensureResults, ResultsPage } from '#/features/grading'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/teach/courses/$courseId_/activities/$activityId/results')({
  loader: ({ context, params }) => ensureResults(context.queryClient, params.activityId),
  staticData: { title: m.platform_tab_results },
  component: ResultsPage,
})
