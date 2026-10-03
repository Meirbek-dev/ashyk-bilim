import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'

import { AiPanel, aiSearchSchema, prefetchPanel } from '#/features/ai'
import { ActivityNotFound, CourseStudioLayout, ensureStudio } from '#/features/course-studio'
import { m } from '#/paraglide/messages'

// The activity studio (spec 5.4): focus layout, 4 tabs; draft/published is a header switch, not a tab. The AI
// panel (slice 6.3: Q&A, lecture critique) is its right slot.
export const Route = createFileRoute('/_authed/teach/courses/$courseId_/activities/$activityId')({
  validateSearch: aiSearchSchema,
  loader: async ({ context, params }) => {
    const activity = await ensureStudio(context.queryClient, params.courseId, params.activityId)
    await prefetchPanel(context.queryClient, { ...params, surface: 'teacher-studio' })
    return activity
  },
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
  component: function Studio() {
    const params = Route.useParams()
    const panel = (
      <Suspense>
        <AiPanel {...params} surface="teacher-studio" />
      </Suspense>
    )
    return <CourseStudioLayout aside={{ label: m.ai_panel_title(), content: panel }} />
  },
  notFoundComponent: ActivityNotFound,
})
