import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { Discussion } from '#/shared/api/gen/types.gen'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { deletePostOptions } from '../queries'

/** Delete a post (its replies go with it) or a reply, after the confirmation. */
export function DeletePost({ item }: { item: Discussion }) {
  const [open, setOpen] = useState(false)
  const remove = useMutation(deletePostOptions(useQueryClient(), item))
  const reply = Boolean(item.parent_id)
  const confirm = () =>
    remove.mutate(
      { path: { discussion_id: item.id } },
      {
        onSuccess: () => {
          setOpen(false)
          toast.add({ title: m.discussions_deleted() })
        },
      },
    )
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) remove.reset()
      }}
      trigger={<Button variant="ghost">{m.discussions_delete()}</Button>}
      title={reply ? m.discussions_delete_reply_title() : m.discussions_delete_post_title()}
      consequence={reply ? m.discussions_delete_reply_consequence() : m.discussions_delete_post_consequence()}
      confirmLabel={m.discussions_delete()}
      onConfirm={confirm}
      pending={remove.isPending}
      error={remove.error}
    />
  )
}
