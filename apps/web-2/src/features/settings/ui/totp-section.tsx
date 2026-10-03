import { useMutation, useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, type FormEvent } from 'react'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import type { TotpVerifyRequest, UserProfile } from '#/shared/api/gen/types.gen'
import { vTotpVerifyRequest } from '#/shared/api/gen/valibot.gen'
import { presentError } from '#/shared/i18n/errors'
import { Alert } from '#/shared/ui/alert'
import { Badge } from '#/shared/ui/badge'
import { Button } from '#/shared/ui/button'
import { useAppForm } from '#/shared/ui/form/use-app-form'
import { Anchor } from '#/shared/ui/link'

import { hasCode } from '../model/settings'
import { totpEnrollOptions, totpVerifyOptions } from '../queries'
import { DisableTotp } from './disable-totp'
import { PlainSection } from './plain-section'

// The QR encoder loads only when someone turns 2FA on.
const TotpQr = lazy(() => import('./totp-qr').then(module => ({ default: module.TotpQr })))

const defaultValues: TotpVerifyRequest = { code: '' }

/** Off -> "Turn on" shows the QR, the key and a code field -> on; on -> "Turn off" through a confirmation. */
export function TotpSection({ profile }: { profile: UserProfile }) {
  const queryClient = useQueryClient()
  const enroll = useMutation(totpEnrollOptions(queryClient))
  const verify = useMutation(totpVerifyOptions(queryClient))
  const form = useAppForm(vTotpVerifyRequest, {
    defaultValues,
    onSubmit: async body => {
      try {
        await verify.mutateAsync({ body })
        enroll.reset()
        form.reset()
        toast(m.settings_totp_enabled())
      } catch (error) {
        // A wrong code belongs under the code field (BUG-083).
        if (!hasCode(error, 'invalid-totp-code')) throw error
        form.setFieldMeta('code', meta => ({ ...meta, errorMap: { ...meta.errorMap, onSubmit: presentError(error) } }))
      }
    },
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void form.handleSubmit()
  }
  const status = profile.mfa_enabled ? (
    <Badge tone="success">{m.settings_totp_on()}</Badge>
  ) : (
    <Badge tone="neutral">{m.settings_totp_off()}</Badge>
  )
  const pending = enroll.data && !profile.mfa_enabled ? enroll.data : null
  const verifyError = hasCode(verify.error, 'invalid-totp-code') ? null : verify.error
  return (
    <PlainSection title={m.settings_totp_title()} description={m.settings_totp_hint()}>
      <div>{status}</div>
      {profile.google_linked ? <p className="text-sm">{m.settings_totp_google()}</p> : null}
      {profile.mfa_enabled ? <DisableTotp /> : null}
      {!profile.mfa_enabled && !pending ? (
        <div>
          <Button variant="outline" pending={enroll.isPending} onClick={() => enroll.mutate({})}>
            {m.settings_totp_enable()}
          </Button>
        </div>
      ) : null}
      {pending ? (
        <form noValidate onSubmit={submit} aria-label={m.settings_totp_title()} className="flex flex-col gap-4">
          <p className="text-sm">{m.settings_totp_scan()}</p>
          <Suspense fallback={<div aria-hidden className="size-48 rounded-md bg-muted" />}>
            <TotpQr uri={pending.uri} />
          </Suspense>
          <p className="font-mono text-sm wrap-anywhere">{m.settings_totp_secret({ secret: pending.secret })}</p>
          <p className="text-sm">
            <Anchor href={pending.uri}>{m.settings_totp_open_app()}</Anchor>
          </p>
          <form.AppField name="code">
            {field => (
              <field.TextField
                label={m.settings_totp_code()}
                inputMode="numeric"
                autoComplete="one-time-code"
                required
              />
            )}
          </form.AppField>
          {verifyError ? <Alert>{presentError(verifyError)}</Alert> : null}
          <div className="flex gap-2">
            <Button type="submit" variant="secondary" pending={verify.isPending}>
              {m.settings_totp_confirm()}
            </Button>
            <Button variant="ghost" onClick={() => enroll.reset()}>
              {m.ui_cancel()}
            </Button>
          </div>
        </form>
      ) : null}
      {enroll.error ? <Alert>{presentError(enroll.error)}</Alert> : null}
    </PlainSection>
  )
}
