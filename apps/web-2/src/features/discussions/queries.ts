import { infiniteQueryOptions, type InfiniteData, type QueryClient } from '@tanstack/react-query'

import type { ApiError } from '#/shared/api/errors'
import {
  createDiscussionMutation,
  deleteDiscussionMutation,
  listDiscussionsInfiniteQueryKey,
  listRepliesInfiniteQueryKey,
  toggleDislikeMutation,
  toggleLikeMutation,
  updateDiscussionMutation,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import { listDiscussions, listReplies } from '#/shared/api/gen/sdk.gen'
import type { CourseId, Discussion, DiscussionId, DiscussionPage, ReactionState } from '#/shared/api/gen/types.gen'

import { applyReaction, appendItem, prependItem, removeItem, replaceItem } from './model/discussions'

const PAGE_SIZE = 20
const nextCursor = (page: DiscussionPage) => page.next_cursor ?? undefined

// Composed by hand like collections: the generated infinite options type their queryFn as skippable.
export const postsOptions = (courseId: CourseId) => {
  const options = { path: { id: courseId }, query: { limit: PAGE_SIZE } }
  return infiniteQueryOptions<
    DiscussionPage,
    ApiError,
    InfiniteData<DiscussionPage>,
    ReturnType<typeof listDiscussionsInfiniteQueryKey>,
    DiscussionId | undefined
  >({
    queryKey: listDiscussionsInfiniteQueryKey(options),
    queryFn: async ({ pageParam, signal }) => {
      const query = { ...options.query, ...(pageParam ? { cursor: pageParam } : {}) }
      const { data } = await listDiscussions({ ...options, query, signal, throwOnError: true })
      return data
    },
    initialPageParam: undefined,
    getNextPageParam: nextCursor,
  })
}

export const repliesOptions = (postId: DiscussionId) => {
  const options = { path: { id: postId }, query: { limit: PAGE_SIZE } }
  return infiniteQueryOptions<
    DiscussionPage,
    ApiError,
    InfiniteData<DiscussionPage>,
    ReturnType<typeof listRepliesInfiniteQueryKey>,
    DiscussionId | undefined
  >({
    queryKey: listRepliesInfiniteQueryKey(options),
    queryFn: async ({ pageParam, signal }) => {
      const query = { ...options.query, ...(pageParam ? { cursor: pageParam } : {}) }
      const { data } = await listReplies({ ...options, query, signal, throwOnError: true })
      return data
    },
    initialPageParam: undefined,
    getNextPageParam: nextCursor,
  })
}

type Pages = InfiniteData<DiscussionPage> | undefined

/** The cached list an item lives in: the course's posts, or the replies of its post. */
function updateList(queryClient: QueryClient, courseId: CourseId, item: Pick<Discussion, 'parent_id'>) {
  const key = item.parent_id ? repliesOptions(item.parent_id).queryKey : postsOptions(courseId).queryKey
  return (change: (data: Pages) => Pages) => queryClient.setQueryData(key, change)
}

// Every answer below goes into the cache (spec 7.6): the page does not read the list again after a write.

export const createPostOptions = (queryClient: QueryClient, courseId: CourseId) => ({
  ...createDiscussionMutation(),
  onSuccess: (post: Discussion) => updateList(queryClient, courseId, post)(data => prependItem(data, post)),
})

// A reply lands in its thread; the post's `replies_count` is only in the list, which is read again.
export const createReplyOptions = (queryClient: QueryClient, courseId: CourseId) => ({
  ...createDiscussionMutation(),
  onSuccess: (reply: Discussion) => updateList(queryClient, courseId, reply)(data => appendItem(data, reply)),
  meta: { invalidates: [postsOptions(courseId).queryKey] },
})

export const updatePostOptions = (queryClient: QueryClient, courseId: CourseId) => ({
  ...updateDiscussionMutation(),
  onSuccess: (next: Discussion) => updateList(queryClient, courseId, next)(data => replaceItem(data, next)),
})

export const deletePostOptions = (queryClient: QueryClient, item: Discussion) => ({
  ...deleteDiscussionMutation(),
  onSuccess: () => updateList(queryClient, item.course_id, item)(data => removeItem(data, item.id)),
})

const reaction = (queryClient: QueryClient, item: Discussion) => (state: ReactionState) =>
  updateList(queryClient, item.course_id, item)(data => applyReaction(data, item.id, state))

export const likeOptions = (queryClient: QueryClient, item: Discussion) => ({
  ...toggleLikeMutation(),
  onSuccess: reaction(queryClient, item),
})

export const dislikeOptions = (queryClient: QueryClient, item: Discussion) => ({
  ...toggleDislikeMutation(),
  onSuccess: reaction(queryClient, item),
})

/** The tab's loader: the first page of posts, and the replies of the open thread when its post is on that page. */
export async function ensureDiscussions(queryClient: QueryClient, courseId: CourseId, thread: string | undefined) {
  const posts = await queryClient.ensureInfiniteQueryData(postsOptions(courseId))
  const open = posts.pages.flatMap(page => page.items).find(post => post.id === thread && post.status === 'active')
  if (open) await queryClient.ensureInfiniteQueryData(repliesOptions(open.id))
}
