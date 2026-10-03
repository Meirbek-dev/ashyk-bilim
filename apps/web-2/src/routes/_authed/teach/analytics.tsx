import { createFileRoute, redirect, stripSearchParams } from '@tanstack/react-router'

import { AnalyticsLayout, loadAnalytics } from '#/features/analytics'
import { filterDefaults, filtersSchema, hasUnknownCohort, pickFilters } from '#/features/analytics/route'
import { m } from '#/paraglide/messages'

// Teaching analytics (spec 5.3): one filter set for the four tabs; a drill-down is a search param of a tab.
export const Route = createFileRoute('/_authed/teach/analytics')({
  validateSearch: filtersSchema,
  search: { middlewares: [stripSearchParams(filterDefaults)] },
  // Before any loader (they run in parallel): an unknown group leaves the URL instead of failing every read.
  beforeLoad: async ({ context, search, location }) => {
    if (!(await hasUnknownCohort(context.queryClient, pickFilters(search)))) return
    throw redirect({ to: location.pathname, search: { ...location.search, cohort: undefined }, replace: true })
  },
  loaderDeps: ({ search }) => pickFilters(search),
  loader: ({ context, deps }) => loadAnalytics(context.queryClient, deps),
  staticData: { title: m.platform_nav_analytics },
  component: AnalyticsLayout,
})
