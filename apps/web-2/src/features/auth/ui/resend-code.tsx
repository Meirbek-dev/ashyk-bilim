import { useMutation } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { getLocale } from '#/paraglide/runtime'
import { ErrorAlert } from '#/shared/components/error-alert'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'
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
      <Button variant="outline" className="w-full" disabled={resend.isPending} onClick={send}>
        {resend.isPending ? <Spinner data-icon="inline-start" /> : null}
        {m.auth_verify_resend()}
      </Button>
      {resend.error ? <ErrorAlert>{limitedText(resend.error)}</ErrorAlert> : null}
    </>
  )
}
