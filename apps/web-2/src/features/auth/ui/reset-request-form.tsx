import { useMutation } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { getLocale } from '#/paraglide/runtime'
import { vPasswordResetRequest } from '#/shared/api/gen/valibot.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { SubmitButton } from '#/shared/components/submit-button'

import { requestPasswordResetOptions } from '../queries'
import { AuthForm } from './auth-form'
import { limitedText } from './login-error'

/** The first reset step: a username or email. The API answers 202 for any login, so the next step always follows. */
export function ResetRequestForm({ onSent }: { onSent: (login: string) => void }) {
  const request = useMutation(requestPasswordResetOptions())
  const form = useAppForm(vPasswordResetRequest, {
    defaultValues: { login: '' },
    onSubmit: body =>
      // The UI language picks the language of the reset email.
      request.mutateAsync(
        { body, headers: { 'Accept-Language': getLocale() } },
        { onSuccess: () => onSent(body.login.trim()) },
      ),
  })
  return (
    <AuthForm onSubmit={() => form.handleSubmit()}>
      <p className="text-sm text-muted-foreground">{m.auth_reset_request_hint()}</p>
      <form.AppField name="login">
        {field => <field.TextField label={m.auth_login_field_login()} autoComplete="username" required />}
      </form.AppField>
      {request.error ? <ErrorAlert>{limitedText(request.error)}</ErrorAlert> : null}
      <SubmitButton type="submit" className="w-full" pending={request.isPending}>
        {m.auth_reset_request_submit()}
      </SubmitButton>
    </AuthForm>
  )
}
