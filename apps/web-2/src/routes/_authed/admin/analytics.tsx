import { createFileRoute } from '@tanstack/react-router'

import { AdminAnalyticsPage, loadAdminAnalytics } from '#/features/analytics'
import { adminAnalyticsSearchSchema } from '#/features/analytics/route'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/admin/analytics')({
  validateSearch: adminAnalyticsSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => loadAdminAnalytics(context.queryClient, deps),
  staticData: { title: m.platform_nav_analytics },
  component: AdminAnalyticsPage,
})
