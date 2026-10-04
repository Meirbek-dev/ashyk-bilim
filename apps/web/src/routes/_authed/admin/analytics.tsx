import { createFileRoute } from '@tanstack/react-router'

import { AdminAnalyticsPage, loadAdminAnalytics } from '#/features/analytics'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/admin/analytics')({
  loader: ({ context }) => loadAdminAnalytics(context.queryClient),
  staticData: { title: m.platform_nav_analytics },
  component: AdminAnalyticsPage,
})
