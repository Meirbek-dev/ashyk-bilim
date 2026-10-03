import { createFileRoute } from '@tanstack/react-router'

import { ActivitySettingsPage } from '#/features/course-studio'
import { ensureTaskStudio, TaskStudio } from '#/features/file-submissions'
import { m } from '#/paraglide/messages'

// The activity's name (course studio), then a file submission's own rules (slice 5.4).
export const Route = createFileRoute('/_authed/teach/courses/$courseId_/activities/$activityId/settings')({
  loader: ({ context, params }) => ensureTaskStudio(context.queryClient, params.activityId),
  staticData: { title: m.platform_tab_settings },
  component: SettingsTab,
})

function SettingsTab() {
  const { fileSubmission } = Route.useLoaderData()
  const { activityId } = Route.useParams()
  return (
    <div className="flex flex-col gap-12">
      <ActivitySettingsPage />
      {fileSubmission ? <TaskStudio activityId={activityId} tab="settings" /> : null}
    </div>
  )
}
