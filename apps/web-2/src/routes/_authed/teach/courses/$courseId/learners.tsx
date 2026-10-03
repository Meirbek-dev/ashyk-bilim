import { createFileRoute } from '@tanstack/react-router'

import { courseGroupsOptions, LearnersPage, linkableGroupsOptions } from '#/features/course-studio'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/teach/courses/$courseId/learners')({
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(courseGroupsOptions(params.courseId)),
      context.queryClient.ensureQueryData(linkableGroupsOptions()),
    ]),
  staticData: { title: m.platform_tab_learners },
  component: LearnersPage,
})
