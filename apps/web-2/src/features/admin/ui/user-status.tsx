import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { AdminUser } from '#/shared/api/gen/types.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { ConfirmDialog } from '#/shared/components/templates/confirm-dialog'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'
import { toast } from '#/shared/ui/toast'

import { setUserStatusOptions } from '../queries'

/**
 * Disable (after a confirmation) or enable. The right comes from `allowed_actions` (`disable` / `enable`); which of
 * the two to offer follows `status`, which the cache takes at once (the write answers 204, SPEC).
 */
export function UserStatus({ user }: { user: AdminUser }) {
  const [confirming, setConfirming] = useState(false)
  const status = useMutation(setUserStatusOptions(useQueryClient()))
  const change = (disabled: boolean) =>
    status.mutate(
      { path: { user_id: user.id }, body: { disabled } },
      {
        onSuccess: () => {
          setConfirming(false)
          toast.add({ title: disabled ? m.admin_user_disabled() : m.admin_user_enabled() })
        },
      },
    )
  const name = user.display_name || user.username
  return (
    <section aria-labelledby="user-access" className="flex flex-col items-start gap-2">
      <h3 id="user-access" className="font-medium">
        {m.admin_user_access_title()}
      </h3>
      {user.status === 'active' ? (
        <ConfirmDialog
          open={confirming}
          onOpenChange={next => {
            setConfirming(next)
            if (!next) status.reset()
          }}
          trigger={<Button variant="outline">{m.admin_user_disable()}</Button>}
          title={m.admin_user_disable_title({ name })}
          consequence={m.admin_user_disable_consequence()}
          confirmLabel={m.admin_user_disable()}
          onConfirm={() => change(true)}
          pending={status.isPending}
          error={status.error}
        />
      ) : (
        <>
          <Button variant="outline" onClick={() => change(false)} disabled={status.isPending}>
            {status.isPending ? <Spinner data-icon="inline-start" /> : null}
            {m.admin_user_enable()}
          </Button>
          {status.error ? <ErrorAlert>{presentError(status.error)}</ErrorAlert> : null}
        </>
      )}
    </section>
  )
}
