import { createFileRoute } from '@tanstack/react-router'

import { ActivityEditPage } from '#/features/course-studio'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/teach/courses/$courseId_/activities/$activityId/edit')({
  staticData: { title: m.platform_tab_edit },
  component: ActivityEditPage,
})
