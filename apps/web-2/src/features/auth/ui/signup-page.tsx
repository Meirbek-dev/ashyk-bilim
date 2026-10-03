import { m } from '#/paraglide/messages'
import { ErrorAlert } from '#/shared/components/error-alert'
import { Link } from '#/shared/components/link'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { Spinner } from '#/shared/ui/spinner'

import { AuthForm } from './auth-form'
import { AuthPage } from './auth-page'
import { useSignupForm } from './use-signup-form'

/** Self-registration; the account works right away, the email is confirmed on the next page. */
export function SignupPage() {
  const { form, pending, formError } = useSignupForm()
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
        <Button type="submit" className="w-full" disabled={pending}>
          {pending ? <Spinner data-icon="inline-start" /> : null}
          {m.auth_signup_submit()}
        </Button>
      </AuthForm>
      <p className="text-sm text-muted-foreground">
        {m.auth_signup_have_account()} <Link to="/login">{m.auth_login_submit()}</Link>
      </p>
    </AuthPage>
  )
}
