import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { m } from '#/paraglide/messages'
import type { ChangePasswordRequest } from '#/shared/api/gen/types.gen'
import { vChangePasswordRequest } from '#/shared/api/gen/valibot.gen'
import { presentError } from '#/shared/i18n/errors'
import { useAppForm } from '#/shared/ui/form/use-app-form'
import { SettingsSection } from '#/shared/ui/templates/settings-section'

import { hasCode } from '../model/settings'
import { changePasswordOptions } from '../queries'
import { PlainSection } from './plain-section'

const defaultValues: ChangePasswordRequest = { current_password: '', new_password: '' }

/** Current + new password; the server ends every other session. A Google-only account has none to change. */
export function PasswordSection({ hasPassword }: { hasPassword: boolean }) {
  const change = useMutation(changePasswordOptions(useQueryClient()))
  const form = useAppForm(vChangePasswordRequest, {
    defaultValues,
    onSubmit: async body => {
      try {
        await change.mutateAsync({ body })
        form.reset()
        toast(m.settings_password_changed())
      } catch (error) {
        // A wrong current password is that field's error, not the form's (BUG-094).
        if (!hasCode(error, 'invalid-credentials')) throw error
        form.setFieldMeta('current_password', meta => ({
          ...meta,
          errorMap: { ...meta.errorMap, onSubmit: presentError(error) },
        }))
      }
    },
  })
  if (!hasPassword) {
    return (
      <PlainSection title={m.settings_password_title()} description={m.settings_password_hint()}>
        <p className="text-sm">{m.settings_password_google()}</p>
      </PlainSection>
    )
  }
  return (
    <SettingsSection
      title={m.settings_password_title()}
      description={m.settings_password_hint()}
      onSubmit={() => form.handleSubmit()}
      pending={change.isPending}
      error={hasCode(change.error, 'invalid-credentials') ? null : change.error}
    >
      <form.AppField name="current_password">
        {field => (
          <field.TextField
            label={m.settings_field_current_password()}
            type="password"
            autoComplete="current-password"
            required
          />
        )}
      </form.AppField>
      <form.AppField name="new_password">
        {field => (
          <field.TextField
            label={m.settings_field_new_password()}
            description={m.settings_field_new_password_hint()}
            type="password"
            autoComplete="new-password"
            required
          />
        )}
      </form.AppField>
    </SettingsSection>
  )
}
