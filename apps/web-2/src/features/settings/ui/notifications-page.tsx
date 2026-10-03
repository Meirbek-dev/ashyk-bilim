import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import * as v from 'valibot'

import { m } from '#/paraglide/messages'
import { useAppForm } from '#/shared/ui/form/use-app-form'
import { SettingsSection } from '#/shared/ui/templates/settings-section'

import { readSwitches, type GamificationSwitches } from '../model/settings'
import { gamificationOptions, updatePreferencesOptions } from '../queries'

const vSwitches = v.object({ xpGain: v.boolean(), showOnLeaderboard: v.boolean() })

/** /settings/notifications: the gamification preferences the API has today (per-type notifications: S-07). */
export function NotificationsPage() {
  const { data } = useSuspenseQuery(gamificationOptions())
  const update = useMutation(updatePreferencesOptions(useQueryClient()))
  const [defaultValues] = useState<GamificationSwitches>(() => readSwitches(data.profile.preferences))
  const form = useAppForm(vSwitches, {
    defaultValues,
    onSubmit: ({ xpGain, showOnLeaderboard }) =>
      update.mutateAsync(
        { body: { notifications: { xpGain }, privacy: { showOnLeaderboard } } },
        { onSuccess: () => toast(m.settings_saved()) },
      ),
  })
  return (
    <SettingsSection
      title={m.settings_gamification_title()}
      description={m.settings_gamification_hint()}
      onSubmit={() => form.handleSubmit()}
      pending={update.isPending}
      error={update.error}
    >
      <form.AppField name="xpGain">{field => <field.SwitchField label={m.settings_field_xp_gain()} />}</form.AppField>
      <form.AppField name="showOnLeaderboard">
        {field => (
          <field.SwitchField label={m.settings_field_leaderboard()} description={m.settings_field_leaderboard_hint()} />
        )}
      </form.AppField>
    </SettingsSection>
  )
}
