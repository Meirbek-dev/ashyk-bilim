import { lazy, Suspense, type FormEvent } from 'react'

import { m } from '#/paraglide/messages'
import type { TotpEnrollment } from '#/shared/api/gen/types.gen'
import { Anchor } from '#/shared/components/anchor'
import { ErrorAlert } from '#/shared/components/error-alert'
import { SubmitButton } from '#/shared/components/submit-button'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'

import type { TotpForm } from './totp-section'

// The QR encoder loads only when someone turns 2FA on.
const TotpQr = lazy(() => import('./totp-qr').then(module => ({ default: module.TotpQr })))

/** The key line, the key in groups of four as authenticator apps show and accept it: easier to type without a slip. */
const keyLine = (key: string) => m.settings_totp_secret({ secret: key.match(/.{1,4}/g)?.join(' ') ?? key })

type TotpSetupProps = {
  form: TotpForm
  enrollment: TotpEnrollment
  /** The swap-focus ref: the setup takes the focus when «Включить» brings it in. */
  focusRef: (node: HTMLElement | null) => void
  pending: boolean
  /** A verify error other than a wrong code (that one sits under the code field). */
  error: unknown
  onCancel: () => void
}

/** Turning 2FA on: the QR, the key, a link to the app and the code that confirms it. */
export function TotpSetup({ form, enrollment, focusRef, pending, error, onCancel }: TotpSetupProps) {
  const submit = (event: FormEvent) => {
    event.preventDefault()
    void form.handleSubmit()
  }
  return (
    <form
      ref={focusRef}
      tabIndex={-1}
      noValidate
      onSubmit={submit}
      aria-label={m.settings_totp_title()}
      className="flex flex-col gap-4 outline-none"
    >
      <p className="text-sm">{m.settings_totp_scan()}</p>
      <Suspense fallback={<div aria-hidden className="size-48 rounded-md bg-muted" />}>
        <TotpQr uri={enrollment.uri} />
      </Suspense>
      <p className="font-mono text-sm wrap-anywhere">{keyLine(enrollment.secret)}</p>
      <p className="text-sm">
        <Anchor href={enrollment.uri}>{m.settings_totp_open_app()}</Anchor>
      </p>
      <form.AppField name="code">
        {field => (
          <field.TextField label={m.settings_totp_code()} inputMode="numeric" autoComplete="one-time-code" required />
        )}
      </form.AppField>
      {error ? <ErrorAlert>{presentError(error)}</ErrorAlert> : null}
      <div className="flex gap-2">
        <SubmitButton type="submit" variant="secondary" pending={pending}>
          {m.settings_totp_confirm()}
        </SubmitButton>
        <Button variant="ghost" onClick={onCancel}>
          {m.ui_cancel()}
        </Button>
      </div>
    </form>
  )
}
