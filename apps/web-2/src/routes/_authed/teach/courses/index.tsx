import { createFileRoute } from '@tanstack/react-router'

import { CoursesPage, myCoursesOptions } from '#/features/course-studio'
import { coursesSearchSchema } from '#/features/course-studio/route'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/teach/courses/')({
  validateSearch: coursesSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => context.queryClient.ensureInfiniteQueryData(myCoursesOptions(deps)),
  staticData: { title: m.platform_nav_teach_courses },
  component: CoursesPage,
})
