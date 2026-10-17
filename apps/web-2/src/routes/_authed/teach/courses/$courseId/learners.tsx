import { createFileRoute } from '@tanstack/react-router'

import { courseGroupsOptions, LearnersPage, learnersOptions, linkableGroupsOptions } from '#/features/course-studio'
import { learnersSearchSchema } from '#/features/course-studio/route'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/teach/courses/$courseId/learners')({
  validateSearch: learnersSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, params, deps }) =>
    Promise.all([
      context.queryClient.query({ ...courseGroupsOptions(params.courseId), staleTime: 'static' }),
      context.queryClient.query({ ...linkableGroupsOptions(), staleTime: 'static' }),
      context.queryClient.infiniteQuery({ ...learnersOptions(params.courseId, deps.q), staleTime: 'static' }),
    ]),
  staticData: { title: m.platform_tab_learners },
  component: LearnersPage,
})
