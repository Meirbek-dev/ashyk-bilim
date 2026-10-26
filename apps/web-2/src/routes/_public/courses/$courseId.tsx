import { createFileRoute } from '@tanstack/react-router'
import { Suspense } from 'react'
import * as v from 'valibot'

import { AiSheet } from '#/features/ai'
import { aiSearchSchema } from '#/features/ai/route'
import { CourseNotFound, CoursePage, ensureCoursePage } from '#/features/course'
import { markdownSummary } from '#/features/markdown'
import { m } from '#/paraglide/messages'
import { pageMeta } from '#/shared/lib/document-title'

// The course page (spec 5.4): header with one primary action; tabs are child routes. The AI panel opens in a side
// sheet from the header (slice 6.3); `?ai=` keeps it open. `?enroll=1`: a guest's «Записаться» came back signed in,
// and the enrolment it asked for runs (B-CRS-16).
export const Route = createFileRoute('/_public/courses/$courseId')({
  validateSearch: v.object({ ...aiSearchSchema.entries, enroll: v.fallback(v.optional(v.literal(1)), undefined) }),
  loader: async ({ context, params }) => {
    const course = await ensureCoursePage(context.queryClient, params.courseId, context.session)
    return { name: course.name, summary: markdownSummary(course.description), image: course.thumbnail_key }
  },
  staticData: { title: m.platform_page_course, notFoundTitle: m.course_not_found },
  head: ({ loaderData }) => ({
    meta: loaderData ? pageMeta(loaderData.name, loaderData.summary, { imageKey: loaderData.image }) : [],
  }),
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
