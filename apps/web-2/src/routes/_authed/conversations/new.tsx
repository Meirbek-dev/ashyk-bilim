import { createFileRoute, redirect } from '@tanstack/react-router'

import { NewConversationPage, peerOptions } from '#/features/conversations'
import { newConversationSearchSchema } from '#/features/conversations/route'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/conversations/new')({
  validateSearch: newConversationSearchSchema,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    if (!deps.to) return
    // A conversation with this person already exists: write there, with the entry point's context.
    const peer = await context.queryClient.query({ ...peerOptions(deps.to), staleTime: 'static' })
    if (peer.conversation_id)
      throw redirect({
        to: '/conversations/$conversationId',
        params: { conversationId: peer.conversation_id },
        search: { course: deps.course, activity: deps.activity },
        replace: true,
      })
  },
  staticData: { title: m.conversations_new_title },
  component: NewConversationPage,
})
