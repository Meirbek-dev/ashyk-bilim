import { useMutation } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { vPasswordResetConfirmRequest } from '#/shared/api/gen/valibot.gen'
import { ErrorAlert } from '#/shared/components/error-alert'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { SubmitButton } from '#/shared/components/submit-button'
import { presentError } from '#/shared/i18n/errors'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { isResetCodeInvalid, resetFormError } from '../model/account-search'
import { confirmPasswordResetOptions } from '../queries'
import { AuthForm } from './auth-form'
import { limitedText } from './login-error'

declare module '@tanstack/react-router' {
  interface HistoryState {
    /** Set by a finished password reset: the sign-in form opens with this name (B-AUTH-13). */
    login?: string
  }
}

type ResetConfirmFormProps = { login: string; code: string | undefined; onRestart: () => void }

/**
 * The code step: the emailed code and a new password (limits from the generated schema). A bad code lands under the
 * code, a policy error under the password; success closes every session (server) and leads to sign-in.
 */
export function ResetConfirmForm({ login, code, onRestart }: ResetConfirmFormProps) {
  const navigate = useNavigate()
  const confirm = useMutation(confirmPasswordResetOptions())
  const form = useAppForm(vPasswordResetConfirmRequest, {
    defaultValues: { login, code: code ?? '', new_password: '' },
    onSubmit: body =>
      confirm
        .mutateAsync(
          { body },
          {
            onSuccess: async () => {
              toast.add({ title: m.auth_reset_done() })
              // The name goes along in history state, never the URL: the sign-in form opens filled in (B-AUTH-13).
              await navigate({ to: '/login', state: { login } })
            },
          },
        )
        .catch((error: unknown) => {
          if (!isResetCodeInvalid(error)) throw error
          const text = presentError(error)
          form.setFieldMeta('code', meta => ({ ...meta, errorMap: { ...meta.errorMap, onSubmit: text } }))
        }),
  })
  const formError = resetFormError(confirm.error)
  return (
    <AuthForm onSubmit={() => form.handleSubmit()}>
      <p className="text-sm text-muted-foreground">{m.auth_reset_sent()}</p>
      <form.AppField name="code">
        {field => <field.TextField label={m.auth_reset_field_code()} autoComplete="one-time-code" required />}
      </form.AppField>
      <form.AppField name="new_password">
        {field => (
          <field.TextField
            label={m.auth_reset_field_password()}
            description={m.auth_signup_password_hint()}
            type="password"
            autoComplete="new-password"
            required
          />
        )}
      </form.AppField>
      {formError ? <ErrorAlert>{limitedText(formError)}</ErrorAlert> : null}
      <SubmitButton type="submit" className="w-full" pending={confirm.isPending}>
        {m.auth_reset_submit()}
      </SubmitButton>
      <Button variant="ghost" className="w-full" onClick={onRestart}>
        {m.auth_reset_again()}
      </Button>
    </AuthForm>
  )
}
