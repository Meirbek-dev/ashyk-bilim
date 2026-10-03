import { createFileRoute } from '@tanstack/react-router'

import { AssessmentSettingsPage, ensureAssessmentSettings } from '#/features/assessments'
import { ActivitySettingsPage } from '#/features/course-studio'
import { m } from '#/paraglide/messages'

// A quiz, exam or code challenge adds its rules, access, publishing, copy and log (slice 5.1) to the name section.
export const Route = createFileRoute('/_authed/teach/courses/$courseId_/activities/$activityId/settings')({
  loader: ({ context, params }) => ensureAssessmentSettings(context.queryClient, params.activityId),
  staticData: { title: m.platform_tab_settings },
  component: SettingsTab,
})

function SettingsTab() {
  return Route.useLoaderData() ? <AssessmentSettingsPage /> : <ActivitySettingsPage />
}
