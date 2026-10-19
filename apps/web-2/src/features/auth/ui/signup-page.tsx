import { useSearch } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { ErrorAlert } from '#/shared/components/error-alert'
import { SubmitButton } from '#/shared/components/submit-button'
import { presentError } from '#/shared/i18n/errors'

import { AuthForm } from './auth-form'
import { AuthSwitch } from './auth-switch'
import { AuthPage } from './auth-page'
import { useSignupForm } from './use-signup-form'

/** Self-registration; the new account is signed in at once, the email is confirmed from the shell's banner. */
export function SignupPage() {
  const { form, pending, formError } = useSignupForm()
  const { redirect } = useSearch({ from: '/_guest/signup' })
  return (
    <AuthPage title={m.auth_signup_title()}>
      <AuthForm onSubmit={() => form.handleSubmit()}>
        <form.AppField name="first_name">
          {field => <field.TextField label={m.auth_signup_field_first_name()} autoComplete="given-name" required />}
        </form.AppField>
        <form.AppField name="last_name">
          {field => <field.TextField label={m.auth_signup_field_last_name()} autoComplete="family-name" required />}
        </form.AppField>
        <form.AppField name="organization">
          {field => (
            <field.TextField
              label={m.auth_signup_field_organization()}
              description={m.auth_signup_organization_hint()}
              autoComplete="organization"
              required
            />
          )}
        </form.AppField>
        <form.AppField name="username">
          {field => (
            <field.TextField
              label={m.auth_signup_field_username()}
              description={m.auth_signup_username_hint()}
              autoComplete="username"
              required
            />
          )}
        </form.AppField>
        <form.AppField name="email">
          {field => <field.TextField label={m.auth_signup_field_email()} type="email" autoComplete="email" required />}
        </form.AppField>
        <form.AppField name="password">
          {field => (
            <field.TextField
              label={m.auth_signup_field_password()}
              description={m.auth_signup_password_hint()}
              type="password"
              autoComplete="new-password"
              required
            />
          )}
        </form.AppField>
        {formError ? <ErrorAlert>{presentError(formError)}</ErrorAlert> : null}
        <SubmitButton type="submit" className="w-full" pending={pending}>
          {m.auth_signup_submit()}
        </SubmitButton>
      </AuthForm>
      <AuthSwitch to="/login" redirect={redirect} />
    </AuthPage>
  )
}
