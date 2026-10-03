import { createFileRoute, stripSearchParams } from '@tanstack/react-router'

import { DrillNotFound, loadPerformance, PerformanceTab, performanceSearchSchema } from '#/features/analytics'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/teach/analytics/performance')({
  validateSearch: performanceSearchSchema,
  search: { middlewares: [stripSearchParams({ page: 1, coursePage: 1 })] },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => loadPerformance(context.queryClient, deps),
  staticData: { title: m.platform_tab_performance },
  component: PerformanceTab,
  notFoundComponent: DrillNotFound,
})
