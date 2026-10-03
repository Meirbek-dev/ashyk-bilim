import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import { vNotificationSettings } from '#/shared/api/gen/valibot.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { SettingsSection } from '#/shared/components/templates/settings-section'
import { toast } from '#/shared/ui/toast'

import { NOTIFICATION_TYPES } from '../model/notifications'
import { preferencesOptions, savePreferencesOptions } from '../queries'
import { notificationTypeLabels } from './labels'

/** One switch per notification type; "Save" sends the whole set (B-NOT-09). Mounted on /settings/notifications. */
export function NotificationPreferences() {
  const { data } = useSuspenseQuery(preferencesOptions())
  const save = useMutation(savePreferencesOptions(useQueryClient()))
  const [defaultValues] = useState(data)
  const form = useAppForm(vNotificationSettings, {
    defaultValues,
    onSubmit: body =>
      save.mutateAsync({ body }, { onSuccess: () => toast.add({ title: m.notifications_prefs_saved() }) }),
  })
  return (
    <SettingsSection
      title={m.notifications_prefs_title()}
      description={m.notifications_prefs_hint()}
      onSubmit={() => form.handleSubmit()}
      pending={save.isPending}
      error={save.error}
    >
      {NOTIFICATION_TYPES.map(type => (
        <form.AppField key={type} name={type}>
          {field => <field.SwitchField label={notificationTypeLabels[type]()} />}
        </form.AppField>
      ))}
    </SettingsSection>
  )
}
