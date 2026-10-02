import { createFileRoute } from '@tanstack/react-router'

import { UnderConstruction } from '#/features/platform'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/admin/gamification')({
  staticData: { title: m.platform_nav_gamification },
  component: UnderConstruction,
})
