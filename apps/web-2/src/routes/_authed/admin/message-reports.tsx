import { createFileRoute } from '@tanstack/react-router'

import { reportOptions, reportsOptions, ReportsPage } from '#/features/conversations'
import { reportsSearchSchema } from '#/features/conversations/route'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/admin/message-reports')({
  validateSearch: reportsSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) =>
    deps.report
      ? context.queryClient.query({ ...reportOptions(deps.report), staleTime: 'static' })
      : context.queryClient.infiniteQuery({ ...reportsOptions(deps.status ?? 'open'), staleTime: 'static' }),
  staticData: { title: m.conversations_reports_title },
  component: ReportsPage,
})
