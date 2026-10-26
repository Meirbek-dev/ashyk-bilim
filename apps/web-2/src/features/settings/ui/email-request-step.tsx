import { useMutation } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import type { ChangeEmailRequest, UserProfile } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { SettingsSection } from '#/shared/components/templates/settings-section'

import { hasCode, vEmailChangeForm } from '../model/settings'
import { changeEmailOptions } from '../queries'

/** Step 1 of B-SET-22: the new address and the password; the server mails a code there. */
export function EmailRequestStep({ profile, onSent }: { profile: UserProfile; onSent: (email: string) => void }) {
  const change = useMutation(changeEmailOptions())
  const defaultValues: ChangeEmailRequest = profile.has_password ? { email: '', password: '' } : { email: '' }
  const form = useAppForm(vEmailChangeForm, {
    defaultValues,
    onSubmit: async body => {
      try {
        await change.mutateAsync({ body })
        onSent(body.email.trim())
      } catch (error) {
        // Only the password was asked here, like the password change (BUG-094).
        if (!hasCode(error, 'invalid-credentials')) throw error
        form.setFieldMeta('password', meta => ({
          ...meta,
          errorMap: { ...meta.errorMap, onSubmit: m.settings_current_password_wrong() },
        }))
      }
    },
  })
  return (
    <SettingsSection
      id="email"
      title={m.settings_email_title()}
      description={m.settings_email_hint()}
      onSubmit={() => form.handleSubmit()}
      pending={change.isPending}
      error={hasCode(change.error, 'invalid-credentials') ? null : change.error}
      submitLabel={m.settings_email_send()}
    >
      <p className="text-sm wrap-anywhere">{m.settings_email_current({ email: profile.email })}</p>
      <form.AppField name="email">
        {field => <field.TextField label={m.settings_field_new_email()} type="email" autoComplete="email" required />}
      </form.AppField>
      {profile.has_password ? (
        <form.AppField name="password">
          {field => (
            <field.TextField
              label={m.settings_field_current_password()}
              type="password"
              autoComplete="current-password"
              required
            />
          )}
        </form.AppField>
      ) : null}
    </SettingsSection>
  )
}
