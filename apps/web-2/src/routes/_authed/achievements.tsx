import { createFileRoute } from '@tanstack/react-router'

import { AchievementsPage, ensureAchievements } from '#/features/achievements'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/achievements')({
  loader: ({ context }) => ensureAchievements(context.queryClient),
  staticData: { title: m.platform_nav_achievements },
  component: AchievementsPage,
})
