import { createFileRoute, stripSearchParams } from '@tanstack/react-router'

import { loadMetricTab, OperationsTab } from '#/features/analytics'
import { metricSearchSchema } from '#/features/analytics/route'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/teach/analytics/operations')({
  validateSearch: metricSearchSchema,
  search: { middlewares: [stripSearchParams({ page: 1 })] },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => loadMetricTab(context.queryClient, deps),
  staticData: { title: m.platform_tab_operations },
  component: OperationsTab,
})
