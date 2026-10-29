import { useMutation, useQueryClient } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { TotpVerifyRequest, UserProfile } from '#/shared/api/gen/types.gen'
import { vTotpVerifyRequest } from '#/shared/api/gen/valibot.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { useSwapFocus } from '#/shared/hooks/use-swap-focus'
import { StatusBadge } from '#/shared/components/status-badge'
import { SubmitButton } from '#/shared/components/submit-button'
import { presentError } from '#/shared/i18n/errors'
import { toast } from '#/shared/ui/toast'

import { hasCode } from '../model/settings'
import { totpEnrollOptions, totpVerifyOptions } from '../queries'
import { DisableTotp } from './disable-totp'
import { PlainSection } from './plain-section'
import { TotpSetup } from './totp-setup'

const defaultValues: TotpVerifyRequest = { code: '' }

export type TotpForm = ReturnType<typeof useAppForm<TotpVerifyRequest>>

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
        <TotpSetup
          form={form}
          enrollment={pending}
          focusRef={swap.focusOn('setup')}
          pending={verify.isPending}
          error={verifyError}
          onCancel={() => {
            swap.mark('off')
            enroll.reset()
          }}
        />
      ) : null}
      {enroll.error ? <ErrorAlert>{presentError(enroll.error)}</ErrorAlert> : null}
    </PlainSection>
  )
}
