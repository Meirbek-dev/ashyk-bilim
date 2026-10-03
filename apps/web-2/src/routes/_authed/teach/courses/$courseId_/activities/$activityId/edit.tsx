import { createFileRoute } from '@tanstack/react-router'

import { AssessmentEditPage, ensureAssessment } from '#/features/assessments'
import { builderSearchSchema } from '#/features/assessments/route'
import { CodeStudio, ensureCodeStudio } from '#/features/code-arena'
import { ActivityEditPage } from '#/features/course-studio'
import { ensureTaskStudio, TaskStudio } from '#/features/file-submissions'
import { m } from '#/paraglide/messages'

// A code challenge is edited by the code arena (slice 5.3), a quiz or exam by its question builder (slice 5.1), a file
// submission by its task (slice 5.4); every other type by the course studio.
export const Route = createFileRoute('/_authed/teach/courses/$courseId_/activities/$activityId/edit')({
  validateSearch: builderSearchSchema,
  loader: async ({ context, params }) => {
    const [assessment, task, code] = await Promise.all([
      ensureAssessment(context.queryClient, params.activityId),
      ensureTaskStudio(context.queryClient, params.activityId),
      ensureCodeStudio(context.queryClient, params.activityId),
    ])
    return { assessment, fileSubmission: task.fileSubmission, codeChallenge: code.codeChallenge }
  },
  staticData: { title: m.platform_tab_edit },
  component: EditTab,
})

function EditTab() {
  const { assessment, fileSubmission, codeChallenge } = Route.useLoaderData()
  const { activityId } = Route.useParams()
  if (codeChallenge) return <CodeStudio activityId={activityId} />
  if (assessment) return <AssessmentEditPage />
  return fileSubmission ? <TaskStudio activityId={activityId} tab="edit" /> : <ActivityEditPage />
}
