import { useMutation, useQueryClient } from '@tanstack/react-query'
import { lazy, Suspense, type FormEvent } from 'react'

import { m } from '#/paraglide/messages'
import type { TotpVerifyRequest, UserProfile } from '#/shared/api/gen/types.gen'
import { vTotpVerifyRequest } from '#/shared/api/gen/valibot.gen'
import { Anchor } from '#/shared/components/anchor'
import { ErrorAlert } from '#/shared/components/error-alert'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { useSwapFocus } from '#/shared/hooks/use-swap-focus'
import { StatusBadge } from '#/shared/components/status-badge'
import { SubmitButton } from '#/shared/components/submit-button'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { hasCode } from '../model/settings'
import { totpEnrollOptions, totpVerifyOptions } from '../queries'
import { DisableTotp } from './disable-totp'
import { PlainSection } from './plain-section'

// The QR encoder loads only when someone turns 2FA on.
const TotpQr = lazy(() => import('./totp-qr').then(module => ({ default: module.TotpQr })))

const defaultValues: TotpVerifyRequest = { code: '' }

/** The key line, the key in groups of four as authenticator apps show and accept it: easier to type without a slip. */
const keyLine = (key: string) => m.settings_totp_secret({ secret: key.match(/.{1,4}/g)?.join(' ') ?? key })

/** Off -> "Turn on" shows the QR, the key and a code field -> on; on -> "Turn off" through a confirmation. */
export function TotpSection({ profile }: { profile: UserProfile }) {
  const queryClient = useQueryClient()
  const enroll = useMutation(totpEnrollOptions(queryClient))
  const verify = useMutation(totpVerifyOptions(queryClient))
  const form = useAppForm(vTotpVerifyRequest, {
    defaultValues,
    onSubmit: async body => {
      try {
        swap.mark('on')
        await verify.mutateAsync({ body })
        enroll.reset()
        form.reset()
        toast.add({ title: m.settings_totp_enabled() })
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
    <StatusBadge tone="success">{m.settings_totp_on()}</StatusBadge>
  ) : (
    <StatusBadge tone="neutral">{m.settings_totp_off()}</StatusBadge>
  )
  const pending = enroll.data && !profile.mfa_enabled ? enroll.data : null
  // «Включить», the setup and «Отключить» replace each other: focus follows (to the setup's start, back to «Включить»
  // on cancel or once turned off, to «Отключить» once turned on).
  const swap = useSwapFocus<'off' | 'setup' | 'on'>()
  const verifyError = hasCode(verify.error, 'invalid-totp-code') ? null : verify.error
  return (
    <PlainSection title={m.settings_totp_title()} description={m.settings_totp_hint()}>
      <div>{status}</div>
      {profile.google_linked ? <p className="text-sm">{m.settings_totp_google()}</p> : null}
      {profile.mfa_enabled ? (
        <div ref={swap.focusOn('on')}>
          <DisableTotp onDisable={() => swap.mark('off')} />
        </div>
      ) : null}
      {!profile.mfa_enabled && !pending ? (
        <div ref={swap.focusOn('off')}>
          <SubmitButton
            variant="outline"
            onClick={() => {
              swap.mark('setup')
              enroll.mutate({})
            }}
            pending={enroll.isPending}
          >
            {m.settings_totp_enable()}
          </SubmitButton>
        </div>
      ) : null}
      {pending ? (
        <form
          ref={swap.focusOn('setup')}
          tabIndex={-1}
          noValidate
          onSubmit={submit}
          aria-label={m.settings_totp_title()}
          className="flex flex-col gap-4 outline-none"
        >
          <p className="text-sm">{m.settings_totp_scan()}</p>
          <Suspense fallback={<div aria-hidden className="size-48 rounded-md bg-muted" />}>
            <TotpQr uri={pending.uri} />
          </Suspense>
          <p className="font-mono text-sm wrap-anywhere">{keyLine(pending.secret)}</p>
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
          {verifyError ? <ErrorAlert>{presentError(verifyError)}</ErrorAlert> : null}
          <div className="flex gap-2">
            <SubmitButton type="submit" variant="secondary" pending={verify.isPending}>
              {m.settings_totp_confirm()}
            </SubmitButton>
            <Button
              variant="ghost"
              onClick={() => {
                swap.mark('off')
                enroll.reset()
              }}
            >
              {m.ui_cancel()}
            </Button>
          </div>
        </form>
      ) : null}
      {enroll.error ? <ErrorAlert>{presentError(enroll.error)}</ErrorAlert> : null}
    </PlainSection>
  )
}
