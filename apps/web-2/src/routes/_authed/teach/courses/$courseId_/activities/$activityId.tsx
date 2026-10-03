import { createFileRoute } from '@tanstack/react-router'

import { ActivityNotFound, CourseStudioLayout, ensureStudio } from '#/features/course-studio'
import { m } from '#/paraglide/messages'

// The activity studio (spec 5.4): focus layout, 4 tabs; draft/published is a header switch, not a tab.
export const Route = createFileRoute('/_authed/teach/courses/$courseId_/activities/$activityId')({
  loader: ({ context, params }) => ensureStudio(context.queryClient, params.courseId, params.activityId),
  staticData: {
    title: m.platform_page_studio,
    layout: 'focus',
    tabs: [
      { to: '/teach/courses/$courseId/activities/$activityId/edit', label: m.platform_tab_edit },
      { to: '/teach/courses/$courseId/activities/$activityId/settings', label: m.platform_tab_settings },
      { to: '/teach/courses/$courseId/activities/$activityId/submissions', label: m.platform_tab_submissions },
      { to: '/teach/courses/$courseId/activities/$activityId/results', label: m.platform_tab_results },
    ],
  },
  head: ({ loaderData }) => ({ meta: loaderData ? [{ title: loaderData.name }] : [] }),
  component: CourseStudioLayout,
  notFoundComponent: ActivityNotFound,
})
