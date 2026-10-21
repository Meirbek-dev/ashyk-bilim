import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'

import { AiPanel, prefetchPanel } from '#/features/ai'
import { aiSearchSchema } from '#/features/ai/route'
import { assessmentPublishControl, ensureAssessment } from '#/features/assessments'
import { ActivityNotFound, CourseStudioLayout, ensureStudio } from '#/features/course-studio'
import { ensureTaskStudio, fileSubmissionPublishControl } from '#/features/file-submissions'
import { m } from '#/paraglide/messages'
import { ListSkeleton } from '#/shared/components/list-skeleton'
import { tabTitle } from '#/shared/lib/document-title'

// The activity studio (spec 5.4): focus layout, 4 tabs; draft/published is a header switch, not a tab. The AI
// panel (slice 6.3: Q&A, lecture critique) is its right slot.
export const Route = createFileRoute('/_authed/teach/courses/$courseId_/activities/$activityId')({
  validateSearch: aiSearchSchema,
  loader: async ({ context, params }) => {
    const activity = await ensureStudio(context.queryClient, params.courseId, params.activityId)
    // The header's published control of an assessment or a file submission reads its lifecycle (slices 5.1, 5.4); the
    // AI panel its scope (6.3).
    await Promise.all([
      ensureAssessment(context.queryClient, params.activityId),
      ensureTaskStudio(context.queryClient, params.activityId),
      prefetchPanel(context.queryClient, { ...params, surface: 'teacher-studio' }),
    ])
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
  head: ({ loaderData, match, matches }) => ({
    meta: loaderData ? [{ title: tabTitle(loaderData.name, match, matches) }] : [],
  }),
  component: StudioLayout,
  notFoundComponent: ActivityNotFound,
})

function StudioLayout() {
  const params = Route.useParams()
  const panel = (
    <Suspense fallback={<ListSkeleton />}>
      <AiPanel {...params} surface="teacher-studio" />
    </Suspense>
  )
  return (
    <CourseStudioLayout
      publishControl={activity => assessmentPublishControl(activity) ?? fileSubmissionPublishControl(activity)}
      aside={{ label: m.ai_panel_title(), content: panel }}
    />
  )
}
