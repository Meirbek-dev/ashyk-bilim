import { createFileRoute } from '@tanstack/react-router'

import { configOptions, GamificationPage } from '#/features/admin'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/admin/gamification')({
  loader: ({ context }) => context.queryClient.ensureQueryData(configOptions()),
  staticData: { title: m.platform_nav_gamification },
  component: GamificationPage,
})
