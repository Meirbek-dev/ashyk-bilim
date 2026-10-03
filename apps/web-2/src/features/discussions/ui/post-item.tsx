import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Suspense, useState } from 'react'
import { toast } from 'sonner'

import { BlockViewer } from '#/features/editor'
import { m } from '#/paraglide/messages'
import type { Discussion, DiscussionAction } from '#/shared/api/gen/types.gen'
import { presentError } from '#/shared/i18n/errors'
import { formatDate } from '#/shared/i18n/format'
import { Avatar } from '#/shared/ui/avatar'
import { Badge } from '#/shared/ui/badge'
import { Button } from '#/shared/ui/button'
import { Link } from '#/shared/ui/link'
import { Skeleton } from '#/shared/ui/skeleton'

import { updatePostOptions } from '../queries'
import { DeletePost } from './delete-post'
import { PostForm } from './post-form'
import { PostReactions } from './post-reactions'

type PostItemProps = {
  item: Discussion
  /** A top-level post whose replies are open below it (`?thread=` is its id): the toggle then hides them. */
  open?: boolean
}

/** One post or reply: author and date, the content, and only the actions its `allowed_actions` lists. */
export function PostItem({ item, open = false }: PostItemProps) {
  const [editing, setEditing] = useState(false)
  const update = useMutation(updatePostOptions(useQueryClient(), item.course_id))
  const can = (action: DiscussionAction) => item.allowed_actions.includes(action)
  const author = item.author?.display_name ?? m.discussions_unknown_author()
  const hidden = item.status === 'hidden'
  const save = (content: string) =>
    update.mutateAsync(
      { path: { id: item.id }, body: { content } },
      { onSuccess: () => (setEditing(false), toast(m.discussions_saved())) },
    )
  // A moderator's status change only (BUG-115): the owner's content is not sent back.
  const moderate = () =>
    update.mutate(
      { path: { id: item.id }, body: { status: hidden ? 'active' : 'hidden' } },
      { onSuccess: () => toast(hidden ? m.discussions_restored() : m.discussions_hidden_done()) },
    )
  const cancel = () => (setEditing(false), update.reset())
  return (
    <article className="flex flex-col gap-3">
      <header className="flex flex-wrap items-center gap-2 text-sm">
        <Avatar name={author} />
        <span className="font-medium wrap-anywhere">{author}</span>
        <span className="text-muted-foreground">{formatDate(item.created_at_unix)}</span>
        {hidden ? <Badge tone="warning">{m.discussions_hidden()}</Badge> : null}
      </header>
      {editing ? (
        <PostForm
          initial={item.content}
          submitLabel={m.ui_save()}
          onSubmit={save}
          pending={update.isPending}
          error={update.error}
          onCancel={cancel}
        />
      ) : (
        <Suspense fallback={<Skeleton shape="line" />}>
          <BlockViewer content={item.content} />
        </Suspense>
      )}
      <div className="flex flex-wrap items-center gap-1">
        {can('react') ? <PostReactions item={item} /> : null}
        {!item.parent_id && item.status === 'active' ? (
          <Link
            to="/courses/$courseId/discussions"
            params={{ courseId: item.course_id }}
            search={{ thread: open ? undefined : item.id }}
            variant="ghost"
          >
            {open ? m.discussions_hide_replies() : m.discussions_replies({ count: item.replies_count })}
          </Link>
        ) : null}
        {can('update') && !editing ? (
          <Button variant="ghost" onClick={() => setEditing(true)}>
            {m.discussions_edit()}
          </Button>
        ) : null}
        {can('moderate') ? (
          <Button variant="ghost" pending={update.isPending && !editing} onClick={moderate}>
            {hidden ? m.discussions_restore() : m.discussions_hide()}
          </Button>
        ) : null}
        {can('delete') ? <DeletePost item={item} /> : null}
      </div>
      {update.error && !editing ? <p className="text-sm text-destructive">{presentError(update.error)}</p> : null}
    </article>
  )
}
