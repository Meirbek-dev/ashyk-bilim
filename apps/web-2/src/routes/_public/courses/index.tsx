import { createFileRoute } from '@tanstack/react-router'

import { coursesFilter, coursesListOptions, CoursesPage } from '#/features/catalog'
import { coursesSearchSchema } from '#/features/catalog/route'
import { m } from '#/paraglide/messages'
import { pageMeta } from '#/shared/lib/document-title'

export const Route = createFileRoute('/_public/courses/')({
  validateSearch: coursesSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    context.queryClient.infiniteQuery({
      ...coursesListOptions(coursesFilter(deps, context.session !== null)),
      staleTime: 'static',
    }),
  staticData: { title: m.platform_nav_courses },
  head: () => ({ meta: pageMeta(m.platform_nav_courses(), m.catalog_landing_lead()) }),
  component: CoursesPage,
})
