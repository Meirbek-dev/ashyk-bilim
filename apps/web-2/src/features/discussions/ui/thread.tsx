import { useSuspenseInfiniteQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { Discussion } from '#/shared/api/gen/types.gen'
import { ListState } from '#/shared/ui/list-state'
import { ShowMore } from '#/shared/ui/show-more'

import { repliesOptions } from '../queries'
import { NewPost } from './new-post'
import { PostItem } from './post-item'

/** The open thread under its post: replies oldest first, "Show more" by cursor, then the reply form. */
export function Thread({ post }: { post: Discussion }) {
  const query = useSuspenseInfiniteQuery(repliesOptions(post.id))
  const replies = query.data.pages.flatMap(page => page.items)
  return (
    <section aria-label={m.discussions_replies({ count: post.replies_count })} className="flex flex-col gap-4 pl-6">
      <ListState
        pending={false}
        error={query.error}
        count={replies.length}
        filtered={false}
        emptyText={m.discussions_replies_empty()}
        onRetry={() => void query.refetch()}
      >
        <ul className="flex flex-col gap-4 border-l pl-4">
          {replies.map(reply => (
            <li key={reply.id}>
              <PostItem item={reply} />
            </li>
          ))}
        </ul>
        <ShowMore
          hasMore={query.hasNextPage}
          pending={query.isFetchingNextPage}
          onMore={() => void query.fetchNextPage()}
        />
      </ListState>
      {post.allowed_actions.includes('reply') ? <NewPost courseId={post.course_id} parentId={post.id} /> : null}
    </section>
  )
}
