import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'

import { AiSheet } from '#/features/ai'
import { aiSearchSchema } from '#/features/ai/route'
import { CourseNotFound, CoursePage, ensureCoursePage } from '#/features/course'
import { markdownSummary } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import { pageMeta } from '#/shared/lib/document-title'

// The course page (spec 5.4): header with one primary action; tabs are child routes. The AI panel opens in a side
// sheet from the header (slice 6.3); `?ai=` keeps it open.
export const Route = createFileRoute('/_public/courses/$courseId')({
  validateSearch: aiSearchSchema,
  loader: async ({ context, params }) => {
    const course = await ensureCoursePage(context.queryClient, params.courseId, context.session)
    return { name: course.name, summary: markdownSummary(course.description) }
  },
  staticData: { title: m.platform_page_course },
  head: ({ loaderData }) => ({ meta: loaderData ? pageMeta(loaderData.name, loaderData.summary) : [] }),
  component: function Course() {
    const ai = (
      <Suspense>
        <AiSheet courseId={Route.useParams().courseId} />
      </Suspense>
    )
    return <CoursePage ai={ai} />
  },
  notFoundComponent: CourseNotFound,
})
