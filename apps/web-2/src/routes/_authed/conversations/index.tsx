import { createFileRoute } from '@tanstack/react-router'

import { conversationsListOptions, ConversationsPage, unreadOptions } from '#/features/conversations'
import { conversationsSearchSchema } from '#/features/conversations/route'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/conversations/')({
  validateSearch: conversationsSearchSchema,
  loaderDeps: ({ search }) => ({ unread: search.unread ?? false }),
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.infiniteQuery({ ...conversationsListOptions(deps.unread), staleTime: 'static' }),
      context.queryClient.query({ ...unreadOptions(), staleTime: 'static' }),
    ]),
  staticData: { title: m.conversations_title },
  component: ConversationsPage,
})
