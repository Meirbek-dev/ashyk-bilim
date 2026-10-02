import { createFileRoute } from '@tanstack/react-router'

import { UnderConstruction } from '#/features/platform'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_public/courses/$courseId/discussions')({
  staticData: { title: m.platform_tab_discussions },
  component: UnderConstruction,
})
