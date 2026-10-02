import { createFileRoute } from '@tanstack/react-router'

import { UnderConstruction } from '#/features/platform'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/learn/$courseId/complete')({
  staticData: { title: m.platform_page_course_complete, layout: 'focus' },
  component: UnderConstruction,
})
