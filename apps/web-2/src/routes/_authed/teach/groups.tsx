import { createFileRoute } from '@tanstack/react-router'

import { UnderConstruction } from '#/features/platform'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/teach/groups')({
  staticData: { title: m.platform_nav_groups },
  component: UnderConstruction,
})
