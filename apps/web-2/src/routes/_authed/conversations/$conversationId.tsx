import { createFileRoute } from '@tanstack/react-router'

import { ConversationPage, messagesOptions } from '#/features/conversations'
import { conversationSearchSchema } from '#/features/conversations/route'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/conversations/$conversationId')({
  validateSearch: conversationSearchSchema,
  loader: ({ context, params }) =>
    context.queryClient.infiniteQuery({ ...messagesOptions(params.conversationId), staleTime: 'static' }),
  staticData: { title: m.conversations_title },
  component: ConversationPage,
})
