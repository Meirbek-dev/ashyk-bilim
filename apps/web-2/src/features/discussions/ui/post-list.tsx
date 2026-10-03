import { useSuspenseInfiniteQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { CourseId } from '#/shared/api/gen/types.gen'
import { ListState } from '#/shared/components/list-state'
import { ShowMore } from '#/shared/components/show-more'

import { postsOptions } from '../queries'
import { PostItem } from './post-item'
import { Thread } from './thread'

/** The course's posts, newest first, by keyset "Show more"; the open thread unfolds under its post. */
export function PostList({ courseId, thread }: { courseId: CourseId; thread: string | undefined }) {
  const query = useSuspenseInfiniteQuery(postsOptions(courseId))
  const posts = query.data.pages.flatMap(page => page.items)
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
        {posts.map(post => {
          const open = post.id === thread && post.status === 'active'
          return (
            <li key={post.id} className="flex flex-col gap-4 rounded-lg border bg-card p-4 text-card-foreground">
              <PostItem item={post} open={open} />
              {open ? <Thread post={post} /> : null}
            </li>
          )
        })}
      </ul>
      <ShowMore
        hasMore={query.hasNextPage}
        pending={query.isFetchingNextPage}
        onMore={() => void query.fetchNextPage()}
      />
    </ListState>
  )
}
