import { createFileRoute } from '@tanstack/react-router'

import { AssessmentSettingsPage, ensureAssessmentSettings } from '#/features/assessments'
import { ActivitySettingsPage } from '#/features/course-studio'
import { ensureTaskStudio, TaskStudio } from '#/features/file-submissions'
import { m } from '#/paraglide/messages'

// The activity's name (course studio); a quiz, exam or code challenge adds its rules, access, publishing, copy and
// log (slice 5.1), a file submission its own rules (slice 5.4).
export const Route = createFileRoute('/_authed/teach/courses/$courseId_/activities/$activityId/settings')({
  loader: async ({ context, params }) => {
    const [assessment, task] = await Promise.all([
      ensureAssessmentSettings(context.queryClient, params.activityId),
      ensureTaskStudio(context.queryClient, params.activityId),
    ])
    return { assessment, fileSubmission: task.fileSubmission }
  },
  staticData: { title: m.platform_tab_settings },
  component: SettingsTab,
})

function SettingsTab() {
  const { assessment, fileSubmission } = Route.useLoaderData()
  const { activityId } = Route.useParams()
  if (assessment) return <AssessmentSettingsPage />
  return (
    <div className="flex flex-col gap-12">
      <ActivitySettingsPage />
      {fileSubmission ? <TaskStudio activityId={activityId} tab="settings" /> : null}
    </div>
  )
}
