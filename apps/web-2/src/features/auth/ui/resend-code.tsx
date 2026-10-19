import { useMutation } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { getLocale } from '#/paraglide/runtime'
import { ErrorAlert } from '#/shared/components/error-alert'
import { SubmitButton } from '#/shared/components/submit-button'
import { toast } from '#/shared/ui/toast'

import { resendVerificationOptions } from '../queries'
import { limitedText } from './login-error'

/** "Send the code again" to the address in the form; the API answers 202 for any address, 429 when throttled. */
export function ResendCode({ email }: { email: () => string }) {
  const resend = useMutation(resendVerificationOptions())
  const send = () =>
    resend.mutate(
      { body: { email: email().trim() }, headers: { 'Accept-Language': getLocale() } },
      { onSuccess: () => toast.add({ title: m.auth_verify_resent() }) },
    )
  return (
    <>
      <SubmitButton variant="outline" className="w-full" pending={resend.isPending} onClick={send}>
        {m.auth_verify_resend()}
      </SubmitButton>
      {resend.error ? <ErrorAlert>{limitedText(resend.error)}</ErrorAlert> : null}
    </>
  )
}
