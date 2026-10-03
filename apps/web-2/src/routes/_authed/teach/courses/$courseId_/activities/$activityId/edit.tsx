import { createFileRoute } from '@tanstack/react-router'

import { ActivityEditPage } from '#/features/course-studio'
import { ensureTaskStudio, TaskStudio } from '#/features/file-submissions'
import { m } from '#/paraglide/messages'

// A file submission is configured by its own feature (slice 5.4); every other type by the course studio.
export const Route = createFileRoute('/_authed/teach/courses/$courseId_/activities/$activityId/edit')({
  loader: ({ context, params }) => ensureTaskStudio(context.queryClient, params.activityId),
  staticData: { title: m.platform_tab_edit },
  component: EditTab,
})

function EditTab() {
  const { fileSubmission } = Route.useLoaderData()
  const { activityId } = Route.useParams()
  return fileSubmission ? <TaskStudio activityId={activityId} tab="edit" /> : <ActivityEditPage />
}
