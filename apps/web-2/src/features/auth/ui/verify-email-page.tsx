import { useMutation } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import { vVerifyEmailRequest } from '#/shared/api/gen/valibot.gen'
import { presentError } from '#/shared/i18n/errors'
import { Alert } from '#/shared/ui/alert'
import { Button } from '#/shared/ui/button'
import { useAppForm } from '#/shared/ui/form/use-app-form'
import { Link } from '#/shared/ui/link'

import { isWrongCode } from '../model/account-search'
import { verifyEmailOptions } from '../queries'
import { AuthForm } from './auth-form'
import { AuthPage } from './auth-page'

/** Email confirmation by the emailed code; the link in the email fills both fields. Values survive a wrong code. */
export function VerifyEmailPage() {
  const search = useSearch({ from: '/_guest/verify-email' })
  const navigate = useNavigate()
  const verify = useMutation(verifyEmailOptions())
  const form = useAppForm(vVerifyEmailRequest, {
    defaultValues: { email: search.email ?? '', code: search.code ?? '' },
    onSubmit: body =>
      verify
        .mutateAsync(
          { body },
          {
            onSuccess: async () => {
              toast(m.auth_verify_done())
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
        {verify.error && !isWrongCode(verify.error) ? <Alert>{presentError(verify.error)}</Alert> : null}
        <Button type="submit" size="block" pending={verify.isPending}>
          {m.auth_verify_submit()}
        </Button>
      </AuthForm>
      <Link to="/login">{m.auth_verify_to_login()}</Link>
    </AuthPage>
  )
}
