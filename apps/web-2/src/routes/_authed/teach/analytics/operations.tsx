import { createFileRoute } from '@tanstack/react-router'

import { UnderConstruction } from '#/features/platform'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/teach/analytics/operations')({
  staticData: { title: m.platform_tab_operations },
  component: UnderConstruction,
})
