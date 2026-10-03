import { createFileRoute } from '@tanstack/react-router'

import { AboutPage, curriculumOptions } from '#/features/course'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_public/courses/$courseId/about')({
  // A signed-in user's syllabus comes from the learner state the layout loaded; a guest reads the curriculum.
  loader: ({ context, params }) =>
    context.session ? null : context.queryClient.ensureQueryData(curriculumOptions(params.courseId)),
  staticData: { title: m.platform_tab_about },
  component: AboutPage,
})
