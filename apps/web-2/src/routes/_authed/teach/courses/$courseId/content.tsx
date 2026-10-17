import { createFileRoute } from '@tanstack/react-router'

import { ContentPage, curriculumOptions } from '#/features/course-studio'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/teach/courses/$courseId/content')({
  loader: ({ context, params }) =>
    context.queryClient.query({ ...curriculumOptions(params.courseId), staleTime: 'static' }),
  staticData: { title: m.platform_tab_content },
  component: ContentPage,
})
