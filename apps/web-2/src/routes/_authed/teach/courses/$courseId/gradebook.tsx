import { createFileRoute } from '@tanstack/react-router'

import { ensureGradebook, GradebookPage } from '#/features/grading'
import { gradebookSearchSchema } from '#/features/grading/route'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/teach/courses/$courseId/gradebook')({
  validateSearch: gradebookSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, params, deps }) => ensureGradebook(context.queryClient, params.courseId, deps),
  staticData: { title: m.platform_tab_gradebook },
  component: GradebookPage,
})
