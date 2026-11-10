import { createFileRoute } from '@tanstack/react-router'

import { ConversationNotFound, ConversationPage, ensureFeed } from '#/features/conversations'
import { conversationSearchSchema } from '#/features/conversations/route'
import { m } from '#/paraglide/messages'

export const Route = createFileRoute('/_authed/conversations/$conversationId')({
  validateSearch: conversationSearchSchema,
  loader: ({ context, params }) => ensureFeed(context.queryClient, params.conversationId),
  staticData: { title: m.conversations_title, notFoundTitle: m.conversations_not_found },
  component: ConversationPage,
  notFoundComponent: ConversationNotFound,
})
