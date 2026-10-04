import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { getLocale } from '#/paraglide/runtime'
import type { RegisterRequest } from '#/shared/api/gen/types.gen'
import { vRegisterRequest } from '#/shared/api/gen/valibot.gen'
import { useIdempotencyKey } from '#/shared/api/idempotency'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { presentError } from '#/shared/i18n/errors'
import { toast } from '#/shared/ui/toast'

import { signupFieldOf } from '../model/account-search'
import { registerOptions } from '../queries'

const defaultValues: RegisterRequest = {
  first_name: '',
  last_name: '',
  organization: '',
  username: '',
  email: '',
  password: '',
}

/** Sign-up: the generated body schema; a taken username or email lands under its field; then the email check. */
export function useSignupForm() {
  const navigate = useNavigate()
  const register = useMutation(registerOptions())
  const idempotency = useIdempotencyKey()
  const form = useAppForm(vRegisterRequest, {
    defaultValues,
    onSubmit: body =>
      register
        .mutateAsync(
          // The UI language picks the language of the verification email (UX-101).
          { body, headers: { 'Idempotency-Key': idempotency.key, 'Accept-Language': getLocale() } },
          {
            onSuccess: async () => {
              idempotency.settle()
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
        }),
  })
  // A code placed under its field is not repeated as the form's message.
  const formError = signupFieldOf(register.error) ? null : register.error
  return { form, pending: register.isPending, formError }
}
