import { createFileRoute, stripSearchParams } from '@tanstack/react-router'

import { loadMetricTab, metricSearchSchema, OverviewTab } from '#/features/analytics'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/teach/analytics/overview')({
  validateSearch: metricSearchSchema,
  search: { middlewares: [stripSearchParams({ page: 1 })] },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => loadMetricTab(context.queryClient, deps),
  staticData: { title: m.platform_tab_overview },
  component: OverviewTab,
})
