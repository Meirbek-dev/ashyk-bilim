import { createFileRoute } from '@tanstack/react-router'

import { AssessmentImportPage, ensureImportPage } from '#/features/assessment-import'
import { importSearchSchema } from '#/features/assessment-import/route'
import { ActivityNotFound, StudioError } from '#/features/course-studio'
import { m } from '#/paraglide/messages'

// A DOT .xlsx test into a new test of a chapter (`?chapter=`) or into an existing draft (`?test=`, its activity):
// file, preview with every problem by cell, create. Authors of the course only (as the workspace); focus layout.
export const Route = createFileRoute('/_authed/teach/courses/$courseId_/import')({
  validateSearch: importSearchSchema,
  loaderDeps: ({ search }) => ({ test: search.test }),
  loader: ({ context, params, deps }) => ensureImportPage(context.queryClient, params.courseId, deps.test),
  staticData: { title: m.assessment_import_title, notFoundTitle: m.studio_activity_not_found, layout: 'focus' },
  component: AssessmentImportPage,
  errorComponent: StudioError,
  notFoundComponent: ActivityNotFound,
})
