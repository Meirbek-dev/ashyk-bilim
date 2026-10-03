import { createFileRoute } from '@tanstack/react-router'

import { ensureGradebook, GradebookPage, gradebookSearchSchema } from '#/features/grading'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/teach/courses/$courseId/gradebook')({
  validateSearch: gradebookSearchSchema,
  loader: ({ context, params }) => ensureGradebook(context.queryClient, params.courseId),
  staticData: { title: m.platform_tab_gradebook },
  component: GradebookPage,
})
