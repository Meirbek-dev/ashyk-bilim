import { useMutation } from '@tanstack/react-query'
import { useHydrated, useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import type { LoginRequest } from '#/shared/api/gen/types.gen'
import { vLoginRequest } from '#/shared/api/gen/valibot.gen'
import { safeRedirect } from '#/shared/auth/redirect'
import { Button } from '#/shared/ui/button'
import { useAppForm } from '#/shared/ui/form/use-app-form'
import { Link } from '#/shared/ui/link'
import { FocusPage } from '#/shared/ui/templates/focus-page'

import { loginOptions } from '../queries'
import { LoginError } from './login-error'

const defaultValues: LoginRequest = { login: '', password: '' }

/** Password sign-in; a 401 `mfa-required` adds the TOTP step and the same form is sent again. */
export function LoginPage() {
  const search = useSearch({ from: '/_guest/login' })
  const navigate = useNavigate()
  const login = useMutation(loginOptions())
  const [totpStep, setTotpStep] = useState(false)
  // Before hydration, typed text would not reach the form state and a click would submit natively:
  // the fields stay disabled until React owns them.
  const hydrated = useHydrated()
  const form = useAppForm(vLoginRequest, {
    defaultValues,
    onSubmit: body =>
      login.mutateAsync(
        { body },
        {
          onSuccess: () => navigate({ href: safeRedirect(search.redirect) }),
          onError: error => {
            if (error instanceof ApiError && error.code === 'mfa-required') setTotpStep(true)
          },
        },
      ),
  })
  const back = (
    <Link to="/" variant="ghost">
      <ArrowLeft aria-hidden />
      {m.platform_back()}
    </Link>
  )
  return (
    <FocusPage back={back} title={m.auth_login_title()}>
      <section className="mx-auto flex max-w-sm flex-col gap-6">
        <h1 className="text-2xl font-semibold">{m.auth_login_title()}</h1>
        <form
          method="post"
          className="flex flex-col gap-4"
          onSubmit={event => {
            event.preventDefault()
            void form.handleSubmit()
          }}
        >
          <fieldset disabled={!hydrated} className="flex flex-col gap-4">
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
            ) : null}
            <LoginError error={login.error} />
            <Button type="submit" size="block" pending={login.isPending}>
              {m.auth_login_submit()}
            </Button>
          </fieldset>
        </form>
      </section>
    </FocusPage>
  )
}
