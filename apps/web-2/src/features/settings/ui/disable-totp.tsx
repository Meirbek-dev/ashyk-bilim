import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { TotpVerifyRequest } from '#/shared/api/gen/types.gen'
import { vTotpVerifyRequest } from '#/shared/api/gen/valibot.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { FormDialog } from '#/shared/components/templates/form-dialog'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { hasCode } from '../model/settings'
import { totpRemoveOptions } from '../queries'

const defaultValues: TotpVerifyRequest = { code: '' }

/**
 * Turning 2FA off weakens sign-in: the dialog asks for a current code from the app (A-3: a session alone cannot strip
 * the second factor). `onDisable`: as the code is sent.
 */
export function DisableTotp({ onDisable }: { onDisable: () => void }) {
  const [open, setOpen] = useState(false)
  const remove = useMutation(totpRemoveOptions(useQueryClient()))
  const form = useAppForm(vTotpVerifyRequest, {
    defaultValues,
    onSubmit: async body => {
      try {
        onDisable()
        await remove.mutateAsync({ body })
        setOpen(false)
        toast.add({ title: m.settings_totp_disabled() })
      } catch (error) {
        // A wrong code belongs under the code field, like turning it on (BUG-083).
        if (!hasCode(error, 'invalid-totp-code')) throw error
        form.setFieldMeta('code', meta => ({ ...meta, errorMap: { ...meta.errorMap, onSubmit: presentError(error) } }))
      }
    },
  })
  return (
    <FormDialog
      open={open}
      onOpenChange={next => {
        setOpen(next)
        if (!next) {
          form.reset()
          remove.reset()
        }
      }}
      trigger={<Button variant="destructive">{m.settings_totp_disable()}</Button>}
      title={m.settings_totp_disable_title()}
      submitLabel={m.settings_totp_disable()}
      onSubmit={() => form.handleSubmit()}
      pending={remove.isPending}
      error={hasCode(remove.error, 'invalid-totp-code') ? null : remove.error}
    >
      <p className="text-sm text-muted-foreground">{m.settings_totp_disable_consequence()}</p>
      <form.AppField name="code">
        {field => (
          <field.TextField
            label={m.settings_totp_code()}
            description={m.settings_totp_disable_code()}
            inputMode="numeric"
            autoComplete="one-time-code"
            required
          />
        )}
      </form.AppField>
    </FormDialog>
  )
}
