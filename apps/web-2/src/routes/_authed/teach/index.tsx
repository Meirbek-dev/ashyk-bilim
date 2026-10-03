import { createFileRoute } from '@tanstack/react-router'

import { InboxPage, inboxSearchSchema, teachWorkOptions } from '#/features/teach-inbox'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/teach/')({
  validateSearch: inboxSearchSchema,
  loader: ({ context }) => context.queryClient.ensureInfiniteQueryData(teachWorkOptions()),
  staticData: { title: m.platform_nav_inbox },
  component: InboxPage,
})
