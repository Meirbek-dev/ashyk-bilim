import { useMutation } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { vVerifyEmailRequest } from '#/shared/api/gen/valibot.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { sessionOptions } from '#/shared/auth/session'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { Link } from '#/shared/components/link'
import { SubmitButton } from '#/shared/components/submit-button'
import { presentError } from '#/shared/i18n/errors'
import { toast } from '#/shared/ui/toast'

import { isWrongCode } from '../model/account-search'
import { verifyEmailOptions } from '../queries'
import { AuthForm } from './auth-form'
import { AuthPage } from './auth-page'
import { ResendCode } from './resend-code'

/** Email confirmation by the emailed code; the link in the email fills both fields. Values survive a wrong code. */
export function VerifyEmailPage() {
  const search = useSearch({ from: '/_guest/verify-email' })
  const navigate = useNavigate()
  // Signed in (the emailed link, B-AUTH-08): the session is read again, so the banner goes and /login leads home.
  const verify = useMutation({ ...verifyEmailOptions(), meta: { invalidates: [sessionOptions().queryKey] } })
  const form = useAppForm(vVerifyEmailRequest, {
    defaultValues: { email: search.email ?? '', code: search.code ?? '' },
    onSubmit: body =>
      verify
        .mutateAsync(
          { body },
          {
            onSuccess: async () => {
              toast.add({ title: m.auth_verify_done() })
              await navigate({ to: '/login' })
            },
          },
        )
        .catch((error: unknown) => {
          if (!isWrongCode(error)) throw error
          const text = m.auth_verify_error_code()
          form.setFieldMeta('code', meta => ({ ...meta, errorMap: { ...meta.errorMap, onSubmit: text } }))
        }),
  })
  return (
    <AuthPage title={m.auth_verify_title()}>
      <AuthForm onSubmit={() => form.handleSubmit()}>
        <form.AppField name="email">
          {field => <field.TextField label={m.auth_signup_field_email()} type="email" autoComplete="email" required />}
        </form.AppField>
        <form.AppField name="code">
          {field => (
            <field.TextField
              label={m.auth_verify_field_code()}
              description={m.auth_verify_code_hint()}
              autoComplete="one-time-code"
              required
            />
          )}
        </form.AppField>
        {verify.error && !isWrongCode(verify.error) ? <ErrorAlert>{presentError(verify.error)}</ErrorAlert> : null}
        <SubmitButton type="submit" className="w-full" pending={verify.isPending}>
          {m.auth_verify_submit()}
        </SubmitButton>
        <ResendCode
          email={() => form.getFieldValue('email')}
          onBadEmail={() =>
            form.setFieldMeta('email', meta => ({
              ...meta,
              isTouched: true,
              errorMap: { ...meta.errorMap, onSubmit: m.validation_email() },
            }))
          }
        />
      </AuthForm>
      <Link to="/login">{m.auth_verify_to_login()}</Link>
    </AuthPage>
  )
}
