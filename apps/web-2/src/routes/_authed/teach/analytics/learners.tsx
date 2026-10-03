import { createFileRoute, stripSearchParams } from '@tanstack/react-router'

import { learnersSearchSchema, LearnersTab, loadLearners } from '#/features/analytics'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/teach/analytics/learners')({
  validateSearch: learnersSearchSchema,
  search: { middlewares: [stripSearchParams({ page: 1 })] },
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => loadLearners(context.queryClient, deps),
  staticData: { title: m.platform_tab_learners },
  component: LearnersTab,
})
