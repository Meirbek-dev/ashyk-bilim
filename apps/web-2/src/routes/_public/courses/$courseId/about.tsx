import { createFileRoute } from '@tanstack/react-router'

import { UnderConstruction } from '#/features/platform'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_public/courses/$courseId/about')({
  staticData: { title: m.platform_tab_about },
  component: UnderConstruction,
})
