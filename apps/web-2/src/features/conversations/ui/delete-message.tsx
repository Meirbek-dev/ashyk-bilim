import { useMutation } from '@tanstack/react-query'
import { Trash2 } from 'lucide-react'
import { useState } from 'react'
import { m } from '#/paraglide/messages'
import type { Message } from '#/shared/api/gen/types.gen'
import { IconButton } from '#/shared/components/icon-button'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { toast } from '#/shared/ui/toast'
import { excerpt } from '../model/feed'
import { deleteOptions } from '../queries'

/** «Удалить» on one's own message: it becomes "Message deleted" for both (docs/DIALOGS.md 9). */
export function DeleteMessage({ message }: { message: Message }) {
  const [open, setOpen] = useState(false)
  const remove = useMutation(deleteOptions(message.conversation_id))
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) remove.reset()
      }}
      trigger={<IconButton label={m.conversations_delete()} icon={<Trash2 aria-hidden />} />}
      title={m.conversations_delete_title()}
      consequence={m.conversations_delete_consequence({ excerpt: excerpt(message.body) })}
      confirmLabel={m.conversations_delete()}
      onConfirm={() =>
        remove.mutate(
          { path: { message_id: message.id } },
          {
            onSuccess: () => {
              setOpen(false)
              toast.add({ title: m.conversations_deleted() })
            },
          },
        )
      }
      pending={remove.isPending}
      error={remove.error}
    />
  )
}
