import { createFileRoute } from '@tanstack/react-router'

import { contributorsOptions, TeamPage } from '#/features/course-studio'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/teach/courses/$courseId/team')({
  loader: ({ context, params }) => context.queryClient.ensureInfiniteQueryData(contributorsOptions(params.courseId)),
  staticData: { title: m.platform_tab_team },
  component: TeamPage,
})
