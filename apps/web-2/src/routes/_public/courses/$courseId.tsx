import { createFileRoute } from '@tanstack/react-router'

import { CourseNotFound, CoursePage, ensureCoursePage } from '#/features/course'
import { m } from '#/paraglide/messages'

// The course page (spec 5.4): header with one primary action; tabs are child routes.
export const Route = createFileRoute('/_public/courses/$courseId')({
  loader: ({ context, params }) => ensureCoursePage(context.queryClient, params.courseId, context.session),
  staticData: { title: m.platform_page_course },
  head: ({ loaderData }) => ({ meta: loaderData ? [{ title: loaderData.name }] : [] }),
  component: CoursePage,
  notFoundComponent: CourseNotFound,
})
