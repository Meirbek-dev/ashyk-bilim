import type { Discussion } from '#/shared/api/gen/types.gen'

import { PostItem } from './post-item'
import { Thread } from './thread'

// The thread a link opened (a notification, a shared URL) is scrolled to once, under the sticky top bar (B-DSC-18).
const reveal = (row: HTMLElement | null) => row?.scrollIntoView({ block: 'start' })

/** One post of the list; the open thread unfolds under it. `landing`: the thread the page was opened on. */
export function PostRow({ post, open, landing = false }: { post: Discussion; open: boolean; landing?: boolean }) {
  return (
    <li
      ref={landing && open ? reveal : undefined}
      className="flex scroll-mt-20 flex-col gap-4 rounded-lg border bg-card p-4 text-card-foreground"
    >
      <PostItem item={post} open={open} />
      {open ? <Thread post={post} /> : null}
    </li>
  )
}
