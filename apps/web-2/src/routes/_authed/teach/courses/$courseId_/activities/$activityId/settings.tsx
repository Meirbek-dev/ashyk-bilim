import { createFileRoute } from '@tanstack/react-router'

import { ActivitySettingsPage } from '#/features/course-studio'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/teach/courses/$courseId_/activities/$activityId/settings')({
  staticData: { title: m.platform_tab_settings },
  component: ActivitySettingsPage,
})
