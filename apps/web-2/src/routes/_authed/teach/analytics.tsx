import { createFileRoute, stripSearchParams } from '@tanstack/react-router'

import { AnalyticsLayout, filterDefaults, filtersSchema, loadAnalytics, pickFilters } from '#/features/analytics'
import { m } from '#/paraglide/messages'

// Teaching analytics (spec 5.3): one filter set for the four tabs; a drill-down is a search param of a tab.
export const Route = createFileRoute('/_authed/teach/analytics')({
  validateSearch: filtersSchema,
  search: { middlewares: [stripSearchParams(filterDefaults)] },
  loaderDeps: ({ search }) => pickFilters(search),
  loader: ({ context, deps }) => loadAnalytics(context.queryClient, deps),
  staticData: { title: m.platform_nav_analytics },
  component: AnalyticsLayout,
})
