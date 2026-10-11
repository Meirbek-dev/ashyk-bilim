import { useMutation } from '@tanstack/react-query'
import { MailWarning, X } from 'lucide-react'

import { m } from '#/paraglide/messages'
import { vVerifyEmailRequest } from '#/shared/api/gen/valibot.gen'
import { sessionOptions } from '#/shared/auth/session'
import { ErrorAlert } from '#/shared/components/error-alert'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { presentError } from '#/shared/i18n/errors'
import { Alert, AlertDescription, AlertTitle } from '#/shared/ui/alert'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'
import { toast } from '#/shared/ui/toast'

import { isWrongCode } from '../model/account-search'
import { verifyEmailOptions } from '../queries'
import { ResendCode } from './resend-code'

/** The banner itself: the code field confirms the address, the session is read again and the banner goes. */
export function EmailBannerForm({ email, onHide }: { email: string; onHide: () => void }) {
  const verify = useMutation({ ...verifyEmailOptions(), meta: { invalidates: [sessionOptions().queryKey] } })
  const form = useAppForm(vVerifyEmailRequest, {
    defaultValues: { email, code: '' },
    onSubmit: body =>
      verify
        .mutateAsync({ body }, { onSuccess: () => toast.add({ title: m.auth_verify_done() }) })
        .catch((error: unknown) => {
          if (!isWrongCode(error)) throw error
          const text = m.auth_verify_error_code()
          form.setFieldMeta('code', meta => ({ ...meta, errorMap: { ...meta.errorMap, onSubmit: text } }))
        }),
  })
  return (
    <Alert className="mb-gutter">
      <MailWarning aria-hidden />
      <AlertTitle className="pr-10">{m.auth_banner_title()}</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <p className="wrap-anywhere">{m.auth_banner_text({ email })}</p>
        <form
          noValidate
          className="flex flex-col gap-2 sm:flex-row sm:items-start"
          onSubmit={event => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <div className="sm:w-56">
            <form.AppField name="code">
              {field => <field.TextField label={m.auth_verify_field_code()} autoComplete="one-time-code" required />}
            </form.AppField>
          </div>
          <div className="flex flex-col gap-2 sm:mt-6 sm:flex-row">
            <Button type="submit" disabled={verify.isPending}>
              {verify.isPending ? <Spinner data-icon="inline-start" /> : null}
              {m.auth_verify_submit()}
            </Button>
            <div>
              <ResendCode email={() => email} />
            </div>
          </div>
        </form>
        {verify.error && !isWrongCode(verify.error) ? <ErrorAlert>{presentError(verify.error)}</ErrorAlert> : null}
      </AlertDescription>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-1 right-1"
        aria-label={m.auth_banner_dismiss()}
        onClick={onHide}
      >
        <X aria-hidden />
      </Button>
    </Alert>
  )
}
