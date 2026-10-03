import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Suspense } from 'react'
import { expect, test } from 'vite-plus/test'

import { m } from '#/paraglide/messages'
import { dashboardQueryKey } from '#/shared/api/gen/@tanstack/react-query.gen'
import type { Dashboard } from '#/shared/api/gen/types.gen'
import { renderInRouter } from '#/shared/ui/testing'

import { StreakBadge } from '../index'

function render(learning_streak: number, last_learning_at_unix: number) {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
  const dashboard: Dashboard = {
    profile: {
      created_at_unix: 0,
      daily_xp_earned: 0,
      learning_streak,
      last_learning_at_unix,
      level: 1,
      level_progress_percent: 0,
      login_streak: 1,
      longest_learning_streak: learning_streak,
      longest_login_streak: 1,
      preferences: {},
      total_activities_completed: 0,
      total_courses_completed: 0,
      total_xp: 0,
      updated_at_unix: 0,
      user_id: '0199a8d5-da4c-753b-a6c4-a08d294bbab5',
      xp_in_current_level: 0,
      xp_to_next_level: 100,
    },
    recent_transactions: [],
    leaderboard: { entries: [], total_participants: 0 },
  }
  client.setQueryData(dashboardQueryKey(), dashboard)
  return renderInRouter(
    <QueryClientProvider client={client}>
      <Suspense>
        <StreakBadge />
      </Suspense>
    </QueryClientProvider>,
  )
}

test('B-ACH-08 the /home line links a live learning streak to /achievements and is empty without one', async () => {
  const now = Math.floor(Date.now() / 1000)
  const live = await render(3, now - 60)
  const text = m.achievements_streak_badge({ days: m.achievements_days({ count: 3 }) })
  await expect.element(live.getByRole('link', { name: text })).toHaveAttribute('href', '/achievements')

  const broken = await render(3, now - 3 * 86_400)
  await expect.element(broken.getByRole('link')).not.toBeInTheDocument()
})
