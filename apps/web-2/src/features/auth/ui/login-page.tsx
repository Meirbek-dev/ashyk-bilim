import { useForm } from '@tanstack/react-form'
import { useMutation } from '@tanstack/react-query'
import { useHydrated, useNavigate, useSearch } from '@tanstack/react-router'
import { useState, type ChangeEvent } from 'react'

import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import type { LoginRequest } from '#/shared/api/gen/types.gen'
import { vLoginRequest } from '#/shared/api/gen/valibot.gen'
import { safeRedirect } from '#/shared/auth/redirect'
import { Button } from '#/shared/ui/button'
import { TextField } from '#/shared/ui/text-field'

import { loginOptions } from '../queries'
import { LoginError } from './login-error'

const defaultValues: LoginRequest = { login: '', password: '' }

type BindableField = {
  name: string
  state: { value: string | null | undefined }
  handleChange: (value: string) => void
}
const bind = (field: BindableField) => ({
  name: field.name,
  value: field.state.value ?? '',
  onChange: (event: ChangeEvent<HTMLInputElement>) => field.handleChange(event.target.value),
})

/** Password sign-in; a 401 `mfa-required` adds the TOTP step and the same form is sent again. */
export function LoginPage() {
  const search = useSearch({ from: '/_guest/login' })
  const navigate = useNavigate()
  const login = useMutation(loginOptions())
  const [totpStep, setTotpStep] = useState(false)
  // Before hydration, typed text would not reach the form state and a click would submit natively:
  // the fields stay disabled until React owns them.
  const hydrated = useHydrated()
  const form = useForm({
    defaultValues,
    validators: { onSubmit: vLoginRequest },
    onSubmit: ({ value }) =>
      login.mutate(
        { body: value },
        {
          onSuccess: () => navigate({ href: safeRedirect(search.redirect) }),
          onError: error => {
            if (error instanceof ApiError && error.code === 'mfa-required') setTotpStep(true)
          },
        },
      ),
  })
  return (
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
          <form.Field name="login">
            {field => (
              <TextField label={m.auth_login_field_login()} {...bind(field)} autoComplete="username" required />
            )}
          </form.Field>
          <form.Field name="password">
            {field => (
              <TextField
                label={m.auth_login_field_password()}
                type="password"
                {...bind(field)}
                autoComplete="current-password"
                required
              />
            )}
          </form.Field>
          {totpStep ? (
            <form.Field name="totp_code">
              {field => (
                <TextField
                  label={m.auth_login_field_totp()}
                  hint={m.auth_login_totp_hint()}
                  {...bind(field)}
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  required
                />
              )}
            </form.Field>
          ) : null}
          <LoginError error={login.error} />
          <Button type="submit" disabled={login.isPending}>
            {m.auth_login_submit()}
          </Button>
        </fieldset>
      </form>
    </section>
  )
}
