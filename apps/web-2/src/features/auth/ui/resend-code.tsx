import { useMutation } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { getLocale } from '#/paraglide/runtime'
import { ErrorAlert } from '#/shared/components/error-alert'
import { SubmitButton } from '#/shared/components/submit-button'
import { toast } from '#/shared/ui/toast'

import { isBadEmail } from '../model/account-search'
import { resendVerificationOptions } from '../queries'
import { limitedText } from './login-error'

/**
 * "Send the code again" to the address in the form; the API answers 202 for any address, 429 when throttled. An empty
 * or malformed address (422 on `email`) goes to `onBadEmail`, which marks the field: an alert would point at nothing.
 */
export function ResendCode({ email, onBadEmail }: { email: () => string; onBadEmail?: () => void }) {
  const resend = useMutation(resendVerificationOptions())
  const send = () =>
    resend.mutate(
      { body: { email: email().trim() }, headers: { 'Accept-Language': getLocale() } },
      {
        onSuccess: () => toast.add({ title: m.auth_verify_resent() }),
        onError: error => (isBadEmail(error) ? onBadEmail?.() : undefined),
      },
    )
  const shown = resend.error && !(onBadEmail && isBadEmail(resend.error)) ? resend.error : null
  return (
    <>
      <SubmitButton variant="outline" className="w-full" pending={resend.isPending} onClick={send}>
        {m.auth_verify_resend()}
      </SubmitButton>
      {shown ? <ErrorAlert>{limitedText(shown)}</ErrorAlert> : null}
    </>
  )
}
