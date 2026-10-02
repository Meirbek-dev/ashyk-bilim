import { createFileRoute } from '@tanstack/react-router'

import { UnderConstruction } from '#/features/platform'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/teach/courses/$courseId/learners')({
  staticData: { title: m.platform_tab_learners },
  component: UnderConstruction,
})
