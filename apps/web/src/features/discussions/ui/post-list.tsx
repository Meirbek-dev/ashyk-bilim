import { useSuspenseInfiniteQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'

import { postsOptions } from '../queries'
import { LinkedThread } from './linked-thread'
import { PostRow } from './post-row'

/** The course's posts, newest first, by keyset "Show more"; the open thread unfolds under its post. */
export function PostList({ courseId, thread }: { courseId: CourseId; thread: string | undefined }) {
  const query = useSuspenseInfiniteQuery(postsOptions(courseId))
  const posts = query.data.pages.flatMap(page => page.items)
  const linked = thread && !posts.some(post => post.id === thread) ? thread : null
  return (
    <ListState
      pending={false}
      error={query.error}
      count={posts.length}
      filtered={false}
      emptyText={m.discussions_empty()}
      onRetry={() => void query.refetch()}
    >
      <ul className="flex flex-col gap-3">
        {linked ? <LinkedThread courseId={courseId} id={linked} /> : null}
        {posts.map(post => (
          <PostRow key={post.id} post={post} open={post.id === thread && post.status === 'active'} />
        ))}
      </ul>
      <ShowMore
        hasMore={query.hasNextPage}
        pending={query.isFetchingNextPage}
        onMore={() => void query.fetchNextPage()}
      />
    </ListState>
  )
}
