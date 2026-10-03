import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { revokeSessionOptions } from '../queries'

/** Ends another session after a confirmation that names its device. */
export function RevokeSession({ handle, device }: { handle: string; device: string }) {
  const [open, setOpen] = useState(false)
  const revoke = useMutation(revokeSessionOptions(useQueryClient()))
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) revoke.reset()
      }}
      trigger={<Button variant="outline">{m.settings_session_revoke()}</Button>}
      title={m.settings_session_revoke_title({ device })}
      consequence={m.settings_session_revoke_consequence()}
      confirmLabel={m.settings_session_revoke()}
      onConfirm={() =>
        revoke.mutate(
          { path: { handle } },
          {
            onSuccess: () => {
              setOpen(false)
              toast.add({ title: m.settings_session_revoked() })
            },
          },
        )
      }
      pending={revoke.isPending}
      error={revoke.error}
    />
  )
}
