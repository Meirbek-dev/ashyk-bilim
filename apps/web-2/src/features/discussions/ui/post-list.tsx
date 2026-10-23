import { useSuspenseInfiniteQuery } from '@tanstack/react-query'
import { useState } from 'react'

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
  // Someone who cannot post (not enrolled) is not asked to start the first discussion.
  const canPost = query.data.pages[0]?.can_post ?? false
  const linked = thread && !posts.some(post => post.id === thread) ? thread : null
  // The thread the page opened on: scrolled to once; one opened later by «Ответить» is already in view.
  const [landing] = useState(thread)
  return (
    <ListState
      pending={false}
      error={query.error}
      count={posts.length}
      filtered={false}
      emptyText={canPost ? m.discussions_empty() : m.discussions_empty_readonly()}
      onRetry={() => void query.refetch()}
    >
      <ul className="flex flex-col gap-3">
        {linked ? <LinkedThread courseId={courseId} id={linked} landing={linked === landing} /> : null}
        {posts.map(post => (
          <PostRow
            key={post.id}
            post={post}
            open={post.id === thread && post.status !== 'hidden'}
            landing={post.id === landing}
          />
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
