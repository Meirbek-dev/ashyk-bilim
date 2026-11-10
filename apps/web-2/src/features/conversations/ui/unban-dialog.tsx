import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { m } from '#/paraglide/messages'
import type { MessageReport } from '#/shared/api/gen/types.gen'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'
import { personName } from '../model/feed'
import { unbanOptions } from '../queries'

export function UnbanDialog({ report }: { report: MessageReport }) {
  const [open, setOpen] = useState(false)
  const unban = useMutation(unbanOptions(report.id))
  const name = personName(report.author)
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) unban.reset()
      }}
      trigger={<Button variant="outline">{m.conversations_unban()}</Button>}
      title={m.conversations_unban_title({ name })}
      consequence={m.conversations_unban_consequence()}
      confirmLabel={m.conversations_unban()}
      onConfirm={() =>
        unban.mutate(
          { path: { user_id: report.author.id } },
          {
            onSuccess: () => {
              setOpen(false)
              toast.add({ title: m.conversations_unbanned_toast() })
            },
          },
        )
      }
      pending={unban.isPending}
      error={unban.error}
    />
  )
}
