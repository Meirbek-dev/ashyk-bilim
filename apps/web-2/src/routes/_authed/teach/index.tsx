import { createFileRoute } from '@tanstack/react-router'

import { ensureInbox, InboxPage } from '#/features/teach-inbox'
import { inboxSearchSchema } from '#/features/teach-inbox/route'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/teach/')({
  validateSearch: inboxSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context, deps }) => ensureInbox(context.queryClient, deps),
  staticData: { title: m.platform_nav_inbox },
  component: InboxPage,
})
