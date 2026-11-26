import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { revokeAccessTokenOptions } from '../queries'

/** Revokes a token after a confirmation that names it: every client using it loses access at once. */
export function RevokeAccessToken({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false)
  const revoke = useMutation(revokeAccessTokenOptions())
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) revoke.reset()
      }}
      trigger={
        <Button variant="ghost" size="sm">
          {m.settings_token_revoke()}
        </Button>
      }
      title={m.settings_token_revoke_title({ name })}
      consequence={m.settings_token_revoke_consequence()}
      confirmLabel={m.settings_token_revoke()}
      onConfirm={() =>
        revoke.mutate(
          { path: { token_id: id } },
          {
            onSuccess: () => {
              setOpen(false)
              toast({ title: m.settings_token_revoked() })
            },
          },
        )
      }
      pending={revoke.isPending}
      error={revoke.error}
    />
  )
}
