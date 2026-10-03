import { createFileRoute } from '@tanstack/react-router'

import { CourseSettingsPage, ensureCourseSettings } from '#/features/course-studio'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/teach/courses/$courseId/settings')({
  loader: ({ context, params }) => ensureCourseSettings(context.queryClient, params.courseId),
  staticData: { title: m.platform_tab_settings },
  component: CourseSettingsPage,
})
