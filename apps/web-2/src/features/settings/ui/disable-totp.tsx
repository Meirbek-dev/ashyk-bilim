import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { totpRemoveOptions } from '../queries'

/** Turning 2FA off weakens sign-in: it goes through a confirmation (spec 5.8). */
export function DisableTotp() {
  const [open, setOpen] = useState(false)
  const remove = useMutation(totpRemoveOptions(useQueryClient()))
  return (
    <div>
      <ConfirmDialog
        open={open}
        onOpenChange={next => {
          setOpen(next)
          if (!next) remove.reset()
        }}
        trigger={<Button variant="destructive">{m.settings_totp_disable()}</Button>}
        title={m.settings_totp_disable_title()}
        consequence={m.settings_totp_disable_consequence()}
        confirmLabel={m.settings_totp_disable()}
        onConfirm={() =>
          remove.mutate(
            {},
            {
              onSuccess: () => {
                setOpen(false)
                toast.add({ title: m.settings_totp_disabled() })
              },
            },
          )
        }
        pending={remove.isPending}
        error={remove.error}
      />
    </div>
  )
}
