import { createFileRoute } from '@tanstack/react-router'

import { CodeStudio, ensureCodeStudio } from '#/features/code-arena'
import { ActivityEditPage } from '#/features/course-studio'
import { ensureTaskStudio, TaskStudio } from '#/features/file-submissions'
import { m } from '#/paraglide/messages'

// A file submission is configured by its own feature (slice 5.4), a code challenge by the code arena (slice 5.3);
// every other type by the course studio.
export const Route = createFileRoute('/_authed/teach/courses/$courseId_/activities/$activityId/edit')({
  loader: async ({ context, params }) => {
    const [task, code] = await Promise.all([
      ensureTaskStudio(context.queryClient, params.activityId),
      ensureCodeStudio(context.queryClient, params.activityId),
    ])
    return { fileSubmission: task.fileSubmission, codeChallenge: code.codeChallenge }
  },
  staticData: { title: m.platform_tab_edit },
  component: EditTab,
})

function EditTab() {
  const { fileSubmission, codeChallenge } = Route.useLoaderData()
  const { activityId } = Route.useParams()
  if (codeChallenge) return <CodeStudio activityId={activityId} />
  return fileSubmission ? <TaskStudio activityId={activityId} tab="edit" /> : <ActivityEditPage />
}
