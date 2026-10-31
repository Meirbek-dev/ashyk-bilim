import { createFileRoute } from '@tanstack/react-router'

import { ConceptsPage, ensureConcepts } from '#/features/concepts'
import { conceptsSearchSchema } from '#/features/concepts/route'
import { m } from '#/paraglide/messages'

// The course concept graph and the class mastery map (docs/AI-FIRST.md 5); `?concept=` / `?learner=` open a sheet.
export const Route = createFileRoute('/_authed/teach/courses/$courseId/concepts')({
  validateSearch: conceptsSearchSchema,
  loader: ({ context, params }) => ensureConcepts(context.queryClient, params.courseId),
  staticData: { title: m.platform_tab_concepts },
  component: ConceptsPage,
})
