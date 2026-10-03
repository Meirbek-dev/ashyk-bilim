import { createFileRoute } from '@tanstack/react-router'

import { AssessmentEditPage, builderSearchSchema, ensureAssessment } from '#/features/assessments'
import { ActivityEditPage } from '#/features/course-studio'
import { ensureTaskStudio, TaskStudio } from '#/features/file-submissions'
import { m } from '#/paraglide/messages'

// A quiz, exam or code challenge edits its questions (slice 5.1), a file submission its task (slice 5.4); every
// other type is edited by the course studio.
export const Route = createFileRoute('/_authed/teach/courses/$courseId_/activities/$activityId/edit')({
  validateSearch: builderSearchSchema,
  loader: async ({ context, params }) => {
    const [assessment, task] = await Promise.all([
      ensureAssessment(context.queryClient, params.activityId),
      ensureTaskStudio(context.queryClient, params.activityId),
    ])
    return { assessment, fileSubmission: task.fileSubmission }
  },
  staticData: { title: m.platform_tab_edit },
  component: EditTab,
})

function EditTab() {
  const { assessment, fileSubmission } = Route.useLoaderData()
  const { activityId } = Route.useParams()
  if (assessment) return <AssessmentEditPage />
  return fileSubmission ? <TaskStudio activityId={activityId} tab="edit" /> : <ActivityEditPage />
}