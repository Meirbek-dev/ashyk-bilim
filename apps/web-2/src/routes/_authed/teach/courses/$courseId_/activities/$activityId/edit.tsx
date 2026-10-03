import { createFileRoute } from '@tanstack/react-router'

import { AssessmentEditPage, builderSearchSchema, ensureAssessment } from '#/features/assessments'
import { ActivityEditPage } from '#/features/course-studio'
import { m } from '#/paraglide/messages'

// A quiz, exam or code challenge edits its questions (slice 5.1); other activities keep the course-studio editors.
export const Route = createFileRoute('/_authed/teach/courses/$courseId_/activities/$activityId/edit')({
  validateSearch: builderSearchSchema,
  loader: ({ context, params }) => ensureAssessment(context.queryClient, params.activityId),
  staticData: { title: m.platform_tab_edit },
  component: EditTab,
})

function EditTab() {
  return Route.useLoaderData() ? <AssessmentEditPage /> : <ActivityEditPage />
}
