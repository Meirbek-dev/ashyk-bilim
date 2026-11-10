import { infiniteQueryOptions, type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'

import { ApiError } from '#/shared/api/errors'
import {
  conversationsUnreadCountOptions,
  conversationsUnreadCountQueryKey,
  conversationWithPeerOptions,
  conversationWithPeerQueryKey,
  deleteMessageBanMutation,
  deleteMessageMutation,
  getMessageReportOptions,
  getMessageReportQueryKey,
  listConversationsInfiniteQueryKey,
  listMessageReportsInfiniteQueryKey,
  listMessagesInfiniteQueryKey,
  markConversationReadMutation,
  messageRecipientsInfiniteQueryKey,
  reportMessageMutation,
  resolveMessageReportMutation,
  sendMessageMutation,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import { listConversations, listMessageReports, listMessages, messageRecipients } from '#/shared/api/gen/sdk.gen'
import type {
  ConversationId,
  ConversationPage,
  Message,
  MessagePage,
  MessageReportPage,
  RecipientPage,
  ReportStatus,
} from '#/shared/api/gen/types.gen'

import { CONVERSATIONS_PAGE, MESSAGES_PAGE, RECIPIENTS_PAGE } from './model/feed'

/** The top bar's number: conversations holding an unread message. Kept fresh by the event stream, not a timer. */
export const unreadOptions = () => conversationsUnreadCountOptions()

// Composed by hand like notificationsListOptions: the generated infinite options are not suspense-typed.
export const conversationsListOptions = (unread: boolean) => {
  const options = { query: { limit: CONVERSATIONS_PAGE, ...(unread ? { unread_only: true } : {}) } }
  return infiniteQueryOptions<
    ConversationPage,
    ApiError,
    InfiniteData<ConversationPage>,
    ReturnType<typeof listConversationsInfiniteQueryKey>,
    string | undefined
  >({
    queryKey: listConversationsInfiniteQueryKey(options),
    queryFn: async ({ pageParam, signal }) => {
      const query = { ...options.query, ...(pageParam ? { cursor: pageParam } : {}) }
      const { data } = await listConversations({ query, signal, throwOnError: true })
      return data
    },
    initialPageParam: undefined,
    getNextPageParam: page => page.next_cursor ?? undefined,
  })
}

/** One conversation's feed, newest page first; "Show earlier" is the next page. */
export const messagesOptions = (conversationId: ConversationId) => {
  const options = { path: { conversation_id: conversationId }, query: { limit: MESSAGES_PAGE } }
  return infiniteQueryOptions<
    MessagePage,
    ApiError,
    InfiniteData<MessagePage>,
    ReturnType<typeof listMessagesInfiniteQueryKey>,
    string | undefined
  >({
    queryKey: listMessagesInfiniteQueryKey(options),
    queryFn: async ({ pageParam, signal }) => {
      const query = { ...options.query, ...(pageParam ? { cursor: pageParam } : {}) }
      const { data } = await listMessages({ path: options.path, query, signal, throwOnError: true })
      return data
    },
    initialPageParam: undefined,
    getNextPageParam: page => page.next_cursor ?? undefined,
  })
}

/** The route's read of a feed: an unknown or foreign conversation (404) is the route's not-found page. */
export async function ensureFeed(queryClient: QueryClient, conversationId: ConversationId) {
  try {
    return await queryClient.infiniteQuery({ ...messagesOptions(conversationId), staleTime: 'static' })
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) throw notFound()
    throw error
  }
}

/** Whether the viewer may write to a person, and their conversation if there is one (the "Write" entry points). */
export const peerOptions = (userId: string) => conversationWithPeerOptions({ path: { user_id: userId } })

export const recipientsOptions = (q: string, courseId: string | undefined) => {
  const options = {
    query: { limit: RECIPIENTS_PAGE, ...(q ? { q } : {}), ...(courseId ? { course_id: courseId } : {}) },
  }
  return infiniteQueryOptions<
    RecipientPage,
    ApiError,
    InfiniteData<RecipientPage>,
    ReturnType<typeof messageRecipientsInfiniteQueryKey>,
    string | undefined
  >({
    queryKey: messageRecipientsInfiniteQueryKey(options),
    queryFn: async ({ pageParam, signal }) => {
      const query = { ...options.query, ...(pageParam ? { cursor: pageParam } : {}) }
      const { data } = await messageRecipients({ query, signal, throwOnError: true })
      return data
    },
    initialPageParam: undefined,
    getNextPageParam: page => page.next_cursor ?? undefined,
  })
}

export const reportsOptions = (status: ReportStatus) => {
  const options = { query: { status, limit: CONVERSATIONS_PAGE } }
  return infiniteQueryOptions<
    MessageReportPage,
    ApiError,
    InfiniteData<MessageReportPage>,
    ReturnType<typeof listMessageReportsInfiniteQueryKey>,
    string | undefined
  >({
    queryKey: listMessageReportsInfiniteQueryKey(options),
    queryFn: async ({ pageParam, signal }) => {
      const query = { ...options.query, ...(pageParam ? { cursor: pageParam } : {}) }
      const { data } = await listMessageReports({ query, signal, throwOnError: true })
      return data
    },
    initialPageParam: undefined,
    getNextPageParam: page => page.next_cursor ?? undefined,
  })
}

export const reportOptions = (reportId: string) => getMessageReportOptions({ path: { report_id: reportId } })

// Prefix keys: every page, filter and limit of a list.
const conversationLists = () => listConversationsInfiniteQueryKey()
const feedOf = (conversationId: ConversationId) => {
  const [{ _id, path }] = listMessagesInfiniteQueryKey({ path: { conversation_id: conversationId } })
  return [{ _id, path, _infinite: true }] as const
}

/** Every person's "may I write" answer: a first message creates the conversation they point at. */
const anyPeer = () => {
  const [{ _id }] = conversationWithPeerQueryKey({ path: { user_id: '' } })
  return [{ _id }]
}

/** The sent message goes into the open feed at once (no optimistic row: it is the server's answer). */
function putSent(queryClient: QueryClient, message: Message) {
  queryClient.setQueriesData<InfiniteData<MessagePage>>({ queryKey: feedOf(message.conversation_id) }, data => {
    if (!data) return data
    const [first, ...rest] = data.pages
    if (!first || first.items.some(item => item.id === message.id)) return data
    return { ...data, pages: [{ ...first, items: [message, ...first.items] }, ...rest] }
  })
}

export const sendOptions = (queryClient: QueryClient) => ({
  ...sendMessageMutation(),
  onSuccess: (message: Message) => putSent(queryClient, message),
  meta: {
    invalidates: [conversationLists(), conversationsUnreadCountQueryKey(), anyPeer()],
  },
})

export const markReadOptions = () => ({
  ...markConversationReadMutation(),
  meta: { invalidates: [conversationLists(), conversationsUnreadCountQueryKey()] },
})

export const deleteOptions = (conversationId: ConversationId) => ({
  ...deleteMessageMutation(),
  meta: { invalidates: [feedOf(conversationId), conversationLists()] },
})

export const reportMessageOptions = (conversationId: ConversationId) => ({
  ...reportMessageMutation(),
  meta: { invalidates: [feedOf(conversationId)] },
})

const reportLists = () => listMessageReportsInfiniteQueryKey()

export const resolveOptions = (reportId: string) => ({
  ...resolveMessageReportMutation(),
  meta: { invalidates: [reportLists(), getMessageReportQueryKey({ path: { report_id: reportId } })] },
})

export const unbanOptions = (reportId: string) => ({
  ...deleteMessageBanMutation(),
  meta: { invalidates: [reportLists(), getMessageReportQueryKey({ path: { report_id: reportId } })] },
})
