import type { Discussion } from '#/shared/api/gen/types.gen'

import { PostItem } from './post-item'
import { Thread } from './thread'

/** One post of the list; the open thread unfolds under it. */
export function PostRow({ post, open }: { post: Discussion; open: boolean }) {
  return (
    <li className="flex flex-col gap-4 rounded-lg border bg-card p-4 text-card-foreground">
      <PostItem item={post} open={open} />
      {open ? <Thread post={post} /> : null}
    </li>
  )
}
