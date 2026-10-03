import { infiniteQueryOptions, type InfiniteData, type QueryClient } from '@tanstack/react-query'

import type { ApiError } from '#/shared/api/errors'
import {
  getNotificationPreferencesOptions,
  getNotificationPreferencesQueryKey,
  listNotificationsInfiniteQueryKey,
  markAllNotificationsReadMutation,
  markNotificationReadMutation,
  putNotificationPreferencesMutation,
  unreadCountOptions,
  unreadCountQueryKey,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import { listNotifications } from '#/shared/api/gen/sdk.gen'
import type {
  Notification,
  NotificationId,
  NotificationPage,
  NotificationSettings,
  UnreadCount,
} from '#/shared/api/gen/types.gen'

import { markRead, PAGE_SIZE, prependNotification } from './model/notifications'

/** The bell's number (B-NOT-01). Kept fresh by the event stream, not by a timer. */
export const unreadOptions = () => unreadCountOptions()

// Composed by hand like collectionsListOptions: the generated infinite options are not suspense-typed. The bell's
// panel reads the first page of the "all" list, the same cache entry as /notifications.
export const notificationsListOptions = (unread: boolean) => {
  const options = { query: { limit: PAGE_SIZE, ...(unread ? { unread } : {}) } }
  return infiniteQueryOptions<
    NotificationPage,
    ApiError,
    InfiniteData<NotificationPage>,
    ReturnType<typeof listNotificationsInfiniteQueryKey>,
    string | undefined
  >({
    queryKey: listNotificationsInfiniteQueryKey(options),
    queryFn: async ({ pageParam, signal }) => {
      const { data } = await listNotifications({
        query: { ...options.query, ...(pageParam ? { cursor: pageParam } : {}) },
        signal,
        throwOnError: true,
      })
      return data
    },
    initialPageParam: undefined,
    getNextPageParam: page => page.next_cursor ?? undefined,
  })
}

// Every list variant (filter, cursor) is a prefix match of the bare key.
const lists = () => listNotificationsInfiniteQueryKey()
const nowSeconds = () => Math.floor(Date.now() / 1000)

/** A read (this tab's answer or another tab's event): the server's count, and the item(s) marked in every list. */
export function applyRead(queryClient: QueryClient, id: NotificationId | null, count: UnreadCount) {
  queryClient.setQueryData(unreadCountQueryKey(), count)
  queryClient.setQueriesData<InfiniteData<NotificationPage>>({ queryKey: lists() }, data =>
    markRead(data, id, nowSeconds()),
  )
}

/** `notification.created`: first in every list, and one more unread. */
export function applyCreated(queryClient: QueryClient, notification: Notification) {
  queryClient.setQueriesData<InfiniteData<NotificationPage>>({ queryKey: lists() }, data =>
    prependNotification(data, notification),
  )
  queryClient.setQueryData<UnreadCount>(unreadCountQueryKey(), count =>
    count ? { unread_count: count.unread_count + 1 } : count,
  )
}

// The answers carry the new count: they go into the cache instead of a refetch (B-NOT-06).
export const markReadOptions = (queryClient: QueryClient) => ({
  ...markNotificationReadMutation(),
  onSuccess: (count: UnreadCount, { path }: { path: { notification_id: NotificationId } }) =>
    applyRead(queryClient, path.notification_id, count),
})

export const markAllReadOptions = (queryClient: QueryClient) => ({
  ...markAllNotificationsReadMutation(),
  onSuccess: (count: UnreadCount) => applyRead(queryClient, null, count),
})

export const preferencesOptions = () => getNotificationPreferencesOptions()

export const savePreferencesOptions = (queryClient: QueryClient) => ({
  ...putNotificationPreferencesMutation(),
  onSuccess: (settings: NotificationSettings) =>
    queryClient.setQueryData(getNotificationPreferencesQueryKey(), settings),
})
