import { createFileRoute } from '@tanstack/react-router'

import { CoursesPage, myCoursesOptions } from '#/features/course-studio'
import { coursesPageSearchSchema, listFilters } from '#/features/course-studio/route'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/teach/courses/')({
  validateSearch: coursesPageSearchSchema,
  loaderDeps: ({ search }) => listFilters(search),
  loader: ({ context, deps }) => context.queryClient.infiniteQuery({ ...myCoursesOptions(deps), staleTime: 'static' }),
  staticData: { title: m.platform_nav_teach_courses },
  component: CoursesPage,
})
