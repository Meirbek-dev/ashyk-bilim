import { infiniteQueryOptions, queryOptions, type InfiniteData, type QueryClient } from '@tanstack/react-query'

import { ApiError } from '#/shared/api/errors'
import {
  createDiscussionMutation,
  deleteDiscussionMutation,
  getDiscussionQueryKey,
  listDiscussionsInfiniteQueryKey,
  listRepliesInfiniteQueryKey,
  toggleDislikeMutation,
  toggleLikeMutation,
  updateDiscussionMutation,
} from '#/shared/api/gen/@tanstack/react-query.gen'
import { getDiscussion, listDiscussions, listReplies } from '#/shared/api/gen/sdk.gen'
import type { CourseId, Discussion, DiscussionId, DiscussionPage, ReactionState } from '#/shared/api/gen/types.gen'

import {
  applyReaction,
  appendItem,
  changePost,
  prependItem,
  removeItem,
  replaceItem,
  setRepliesCount,
} from './model/discussions'

const PAGE_SIZE = 20
const nextCursor = (page: DiscussionPage) => page.next_cursor ?? undefined

// Composed by hand like collections: the generated infinite options type their queryFn as skippable.
export const postsOptions = (courseId: CourseId) => {
  const options = { path: { course_id: courseId }, query: { limit: PAGE_SIZE } }
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
  const options = { path: { discussion_id: postId }, query: { limit: PAGE_SIZE } }
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

/**
 * A deep-linked thread (`?thread=<id>`) whose post is not on a loaded page: `GET /discussions/{id}`. Unknown, hidden
 * or inaccessible is `null` (the link opens the list only).
 */
export const linkedPostOptions = (id: DiscussionId) => {
  const options = { path: { discussion_id: id } }
  return queryOptions({
    queryKey: getDiscussionQueryKey(options),
    queryFn: async ({ signal }) => {
      try {
        const { data } = await getDiscussion({ ...options, signal, throwOnError: true })
        return data
      } catch (error) {
        if (error instanceof ApiError && (error.status === 404 || error.status === 422)) return null
        throw error
      }
    },
  })
}

type Pages = InfiniteData<DiscussionPage> | undefined

/** The cached lists an item lives in: the course's posts (and its deep-linked copy), or the replies of its post. */
function updateList(queryClient: QueryClient, courseId: CourseId, item: Pick<Discussion, 'id' | 'parent_id'>) {
  return (change: (data: Pages) => Pages) => {
    if (item.parent_id) {
      queryClient.setQueryData(repliesOptions(item.parent_id).queryKey, change)
    } else {
      queryClient.setQueryData(postsOptions(courseId).queryKey, change)
      queryClient.setQueryData(linkedPostOptions(item.id).queryKey, post => post && changePost(post, change))
    }
  }
}

// Every answer below goes into the cache (spec 7.6): the page does not read the list again after a write.

export const createPostOptions = (queryClient: QueryClient, courseId: CourseId) => ({
  ...createDiscussionMutation(),
  onSuccess: (post: Discussion) => updateList(queryClient, courseId, post)(data => prependItem(data, post)),
})

// A reply lands in its thread; its post takes the new `replies_count` from the same answer.
export const createReplyOptions = (queryClient: QueryClient, courseId: CourseId) => ({
  ...createDiscussionMutation(),
  onSuccess: (reply: Discussion) => {
    updateList(queryClient, courseId, reply)(data => appendItem(data, reply))
    const { parent_id: id, parent_replies_count: count } = reply
    if (id && count !== null)
      updateList(queryClient, courseId, { id, parent_id: null })(data => setRepliesCount(data, id, count))
  },
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

/** An open thread: an active top-level post of this course. */
export const opensThread = (post: Discussion | null | undefined, courseId: CourseId): post is Discussion =>
  Boolean(post && post.course_id === courseId && post.parent_id === null && post.status === 'active')

/**
 * The tab's loader: the first page of posts and the open thread's replies; a thread post that is not on that page is
 * read alone (`linkedPostOptions`).
 */
export async function ensureDiscussions(queryClient: QueryClient, courseId: CourseId, thread: string | undefined) {
  const posts = await queryClient.ensureInfiniteQueryData(postsOptions(courseId))
  if (!thread) return
  const listed = posts.pages.flatMap(page => page.items).find(post => post.id === thread)
  const open = listed ?? (await queryClient.ensureQueryData(linkedPostOptions(thread)))
  if (opensThread(open, courseId)) await queryClient.ensureInfiniteQueryData(repliesOptions(open.id))
}
