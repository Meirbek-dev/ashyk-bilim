import { createFileRoute } from '@tanstack/react-router'

import { UnderConstruction } from '#/features/platform'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/admin/analytics')({
  staticData: { title: m.platform_nav_analytics },
  component: UnderConstruction,
})
