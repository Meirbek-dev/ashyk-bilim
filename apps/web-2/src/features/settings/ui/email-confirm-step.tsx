import { useMutation } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { vConfirmEmailChangeRequest } from '#/shared/api/gen/valibot.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { SettingsSection } from '#/shared/components/templates/settings-section'
import { Button } from '#/shared/ui/button'
import { toast } from '#/shared/ui/toast'

import { confirmEmailChangeOptions } from '../queries'

/** Step 2 of B-SET-22: the code from the email switches the account to the new address. */
export function EmailConfirmStep({ email, onRestart }: { email: string; onRestart: () => void }) {
  const confirm = useMutation(confirmEmailChangeOptions())
  const form = useAppForm(vConfirmEmailChangeRequest, {
    defaultValues: { code: '' },
    onSubmit: body =>
      confirm.mutateAsync(
        { body },
        {
          onSuccess: () => {
            toast.add({ title: m.settings_email_changed() })
            onRestart()
          },
        },
      ),
  })
  return (
    <SettingsSection
      id="email"
      title={m.settings_email_title()}
      description={m.settings_email_code_sent({ email })}
      onSubmit={() => form.handleSubmit()}
      pending={confirm.isPending}
      error={confirm.error}
      submitLabel={m.settings_email_confirm()}
    >
      <form.AppField name="code">
        {field => (
          <field.TextField
            label={m.settings_field_email_code()}
            inputMode="numeric"
            autoComplete="one-time-code"
            required
          />
        )}
      </form.AppField>
      <div>
        <Button type="button" variant="ghost" onClick={onRestart}>
          {m.settings_email_other()}
        </Button>
      </div>
    </SettingsSection>
  )
}
