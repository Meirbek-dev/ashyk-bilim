import { createFileRoute } from '@tanstack/react-router'

import { CourseNotFound } from '#/features/course'
import { CourseWorkspace, ensureWorkspace } from '#/features/course-studio'
import { m } from '#/paraglide/messages'

// The course workspace (spec 5.4): 7 tabs; access, groups and enrollments live in learners.
export const Route = createFileRoute('/_authed/teach/courses/$courseId')({
  loader: ({ context, params }) => ensureWorkspace(context.queryClient, params.courseId),
  staticData: {
    title: m.platform_page_course_workspace,
    tabs: [
      { to: '/teach/courses/$courseId/overview', label: m.platform_tab_overview },
      { to: '/teach/courses/$courseId/content', label: m.platform_tab_content },
      { to: '/teach/courses/$courseId/learners', label: m.platform_tab_learners },
      { to: '/teach/courses/$courseId/gradebook', label: m.platform_tab_gradebook },
      { to: '/teach/courses/$courseId/team', label: m.platform_tab_team },
      { to: '/teach/courses/$courseId/settings', label: m.platform_tab_settings },
      { to: '/teach/courses/$courseId/publish', label: m.platform_tab_publish },
    ],
  },
  head: ({ loaderData }) => ({ meta: loaderData ? [{ title: loaderData.name }] : [] }),
  component: CourseWorkspace,
  notFoundComponent: CourseNotFound,
})
