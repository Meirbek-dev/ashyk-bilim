import { createFileRoute } from '@tanstack/react-router'

import { PublishPage, readinessOptions, updatesOptions } from '#/features/course-studio'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/teach/courses/$courseId/publish')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(readinessOptions(params.courseId)),
      context.queryClient.ensureInfiniteQueryData(updatesOptions(params.courseId)),
    ]),
  staticData: { title: m.platform_tab_publish },
  component: PublishPage,
})
