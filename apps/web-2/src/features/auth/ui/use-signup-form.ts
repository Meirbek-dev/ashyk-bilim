import { useMutation } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { getLocale } from '#/paraglide/runtime'
import type { RegisterRequest } from '#/shared/api/gen/types.gen'
import { useIdempotencyKey } from '#/shared/api/idempotency'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { presentError } from '#/shared/i18n/errors'
import { toast } from '#/shared/ui/toast'

import { signupFieldOf, vSignupForm } from '../model/account-search'
import { loginOptions, registerOptions } from '../queries'

const defaultValues: RegisterRequest = {
  first_name: '',
  last_name: '',
  organization: '',
  username: '',
  email: '',
  password: '',
}

/**
 * Sign-up: the generated body schema (the address checked here too); a taken username or email lands under its field. The new account is signed in
 * at once and goes where the guest was headed (`redirect`, else /home; an unconfirmed address gets the shell's banner).
 * Only if that sign-in fails: the code step (unconfirmed) or the sign-in page.
 */
export function useSignupForm() {
  const navigate = useNavigate()
  const { redirect } = useSearch({ from: '/_guest/signup' })
  const register = useMutation(registerOptions())
  const login = useMutation(loginOptions())
  const idempotency = useIdempotencyKey()
  const form = useAppForm(vSignupForm, {
    defaultValues,
    onSubmit: body =>
      register
        .mutateAsync(
          // The UI language picks the language of the verification email (UX-101).
          { body, headers: { 'Idempotency-Key': idempotency.key, 'Accept-Language': getLocale() } },
          {
            onSuccess: async profile => {
              idempotency.settle()
              const signedIn = await login
                .mutateAsync({ body: { login: body.username, password: body.password } })
                .then(() => true)
                .catch(() => false)
              if (signedIn) {
                toast.add({ title: profile.email_verified ? m.auth_signup_welcome() : m.auth_signup_done() })
                await navigate({ href: redirect ?? '/home' })
                return
              }
              // Without email delivery the server reports the address as confirmed: straight to sign-in.
              if (profile.email_verified) {
                toast.add({ title: m.auth_signup_done_signin() })
                await navigate({ to: '/login' })
                return
              }
              toast.add({ title: m.auth_signup_done() })
              await navigate({ to: '/verify-email', search: { email: body.email } })
            },
            onError: error => idempotency.settle(error),
          },
        )
        .catch((error: unknown) => {
          const field = signupFieldOf(error)
          if (!field) throw error
          form.setFieldMeta(field, meta => ({ ...meta, errorMap: { ...meta.errorMap, onSubmit: presentError(error) } }))
          // The keyboard and the screen reader land on what to fix, as after a 422 (useAppForm), not on the button.
          requestAnimationFrame(() => document.querySelector<HTMLElement>(`form [name="${field}"]`)?.focus())
        }),
  })
  // A code placed under its field is not repeated as the form's message.
  const formError = signupFieldOf(register.error) ? null : register.error
  return { form, pending: register.isPending || login.isPending, formError }
}
