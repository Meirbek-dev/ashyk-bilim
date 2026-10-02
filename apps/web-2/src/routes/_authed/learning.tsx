import { createFileRoute } from '@tanstack/react-router'

import { UnderConstruction } from '#/features/platform'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/learning')({
  staticData: { title: m.platform_nav_learning },
  component: UnderConstruction,
})
