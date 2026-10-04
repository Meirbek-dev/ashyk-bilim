import { createFileRoute } from '@tanstack/react-router'

import { ensureQueue, QueuePage } from '#/features/grading'
import { queueSearchSchema } from '#/features/grading/route'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/teach/courses/$courseId_/activities/$activityId/submissions')({
  validateSearch: queueSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, params, deps }) => ensureQueue(context.queryClient, params.activityId, deps),
  staticData: { title: m.platform_tab_submissions },
  component: QueuePage,
})
