import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { revokeOtherSessionsOptions } from '../queries'

/** Ends every session but this one after one confirmation: the way out after a lost phone or a shared computer. */
export function RevokeOtherSessions({ handles }: { handles: readonly string[] }) {
  const [open, setOpen] = useState(false)
  const revoke = useMutation(revokeOtherSessionsOptions(useQueryClient()))
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) revoke.reset()
      }}
      trigger={<Button variant="outline">{m.settings_sessions_revoke_others()}</Button>}
      title={m.settings_sessions_revoke_others_title()}
      consequence={m.settings_sessions_revoke_others_consequence()}
      confirmLabel={m.settings_sessions_revoke_others_confirm()}
      onConfirm={() =>
        revoke.mutate(handles, {
          onSuccess: () => {
            setOpen(false)
            toast.add({ title: m.settings_sessions_revoked_others() })
          },
        })
      }
      pending={revoke.isPending}
      error={revoke.error}
    />
  )
}
