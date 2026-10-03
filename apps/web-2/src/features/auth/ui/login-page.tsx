import { useMutation } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import type { LoginRequest } from '#/shared/api/gen/types.gen'
import { vLoginRequest } from '#/shared/api/gen/valibot.gen'
import { Button } from '#/shared/ui/button'
import { useAppForm } from '#/shared/ui/form/use-app-form'
import { Link } from '#/shared/ui/link'

import { loginOptions } from '../queries'
import { AuthForm } from './auth-form'
import { AuthPage } from './auth-page'
import { GoogleSignIn } from './google-sign-in'
import { LoginError } from './login-error'

const defaultValues: LoginRequest = { login: '', password: '' }

/** Password sign-in; a 401 `mfa-required` turns the form into the code step and the same sign-in is sent again. */
export function LoginPage() {
  const search = useSearch({ from: '/_guest/login' })
  const redirect = search.redirect ?? '/home'
  const navigate = useNavigate()
  const login = useMutation(loginOptions())
  const [totpStep, setTotpStep] = useState(false)
  const form = useAppForm(vLoginRequest, {
    defaultValues,
    onSubmit: body =>
      login.mutateAsync(
        { body: totpStep ? body : { ...body, totp_code: undefined } },
        {
          onSuccess: () => navigate({ href: redirect }),
          onError: error => {
            if (error instanceof ApiError && error.code === 'mfa-required') setTotpStep(true)
          },
        },
      ),
  })
  const backToPassword = () => {
    setTotpStep(false)
    login.reset()
  }
  return (
    <AuthPage title={m.auth_login_title()}>
      {totpStep ? null : <GoogleSignIn redirect={redirect} />}
      <AuthForm onSubmit={() => form.handleSubmit()}>
        {totpStep ? (
          <form.AppField name="totp_code">
            {field => (
              <field.TextField
                label={m.auth_login_field_totp()}
                description={m.auth_login_totp_hint()}
                autoComplete="one-time-code"
                inputMode="numeric"
                required
              />
            )}
          </form.AppField>
        ) : (
          <>
            <form.AppField name="login">
              {field => <field.TextField label={m.auth_login_field_login()} autoComplete="username" required />}
            </form.AppField>
            <form.AppField name="password">
              {field => (
                <field.TextField
                  label={m.auth_login_field_password()}
                  type="password"
                  autoComplete="current-password"
                  required
                />
              )}
            </form.AppField>
          </>
        )}
        <LoginError error={login.error} googleError={totpStep ? undefined : search.error} />
        <Button type="submit" size="block" pending={login.isPending}>
          {m.auth_login_submit()}
        </Button>
        {totpStep ? (
          <Button variant="ghost" size="block" onClick={backToPassword}>
            {m.auth_login_back()}
          </Button>
        ) : null}
      </AuthForm>
      <p className="text-sm text-muted-foreground">
        {m.auth_login_no_account()} <Link to="/signup">{m.platform_nav_signup()}</Link>
      </p>
    </AuthPage>
  )
}
