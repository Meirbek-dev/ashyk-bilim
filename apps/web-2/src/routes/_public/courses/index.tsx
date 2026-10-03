import { createFileRoute } from '@tanstack/react-router'

import { coursesFilter, coursesListOptions, CoursesPage, coursesSearchSchema } from '#/features/catalog'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_public/courses/')({
  validateSearch: coursesSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.ensureInfiniteQueryData(coursesListOptions(coursesFilter(deps, context.session !== null))),
  staticData: { title: m.platform_nav_courses },
  component: CoursesPage,
})
