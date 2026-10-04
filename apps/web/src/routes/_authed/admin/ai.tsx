import { createFileRoute } from '@tanstack/react-router'

import { AdminAiPage, evalsOptions, runsOptions, settingsOptions, usageSummaryOptions } from '#/features/ai'
import { adminAiSearchSchema, runsFilter } from '#/features/ai/route'
import { m } from '#/paraglide/messages'

// AI administration (slice 6.3): settings, usage, runs (filters and the open run in the URL), evals.
export const Route = createFileRoute('/_authed/admin/ai')({
  validateSearch: adminAiSearchSchema,
  loaderDeps: ({ search }) => runsFilter(search),
  loader: ({ context: { queryClient }, deps }) =>
    Promise.all([
      queryClient.ensureQueryData(settingsOptions()),
      queryClient.ensureQueryData(usageSummaryOptions()),
      queryClient.ensureQueryData(evalsOptions()),
      queryClient.ensureInfiniteQueryData(runsOptions(deps)),
    ]),
  staticData: { title: m.platform_nav_ai },
  component: AdminAiPage,
})
