import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'

import { m } from '#/paraglide/messages'
import type { UpdateGamificationConfigRequest } from '#/shared/api/gen/types.gen'
import { useAppForm } from '#/shared/components/form/use-app-form'
import { ConflictDialog } from '#/shared/components/templates/conflict-dialog'
import { Link } from '#/shared/components/link'
import { SettingsPage } from '#/shared/components/templates/settings-page'
import { SettingsSection } from '#/shared/components/templates/settings-section'
import { toast } from '#/shared/ui/toast'

import { isStale, REWARD_SOURCES, rulesBody, rulesForm, rulesFormSchema } from '../model/admin'
import { configOptions, configVersion, updateConfigOptions } from '../queries'
import { rewardLabels } from './labels'
import { useIfMatch } from './use-if-match'

/**
 * The XP rules (`GET` / `PUT /gamification/config`, N-5): the daily limit and a reward per source; a blank field is
 * the platform default. The PUT replaces every override, so ones this form does not show are sent back as they were.
 * Sent with `If-Match` (B-ADM-24); a 412 opens the conflict dialog.
 */
export function GamificationPage() {
  const { data: config } = useSuspenseQuery(configOptions())
  const queryClient = useQueryClient()
  const update = useMutation(updateConfigOptions(queryClient))
  const write = useIfMatch(
    useState(() => config.version ?? 0),
    async (body: UpdateGamificationConfigRequest, version: number) => {
      const saved = await update.mutateAsync(
        { body, headers: { 'If-Match': version } },
        { onSuccess: () => toast.add({ title: m.admin_saved() }) },
      )
      return { version: saved.version ?? version }
    },
    () => configVersion(queryClient),
  )
  // Captured once: the cache write after saving must not reset what the user typed.
  const [defaultValues] = useState(() => rulesForm(config))
  const form = useAppForm(rulesFormSchema, {
    defaultValues,
    onSubmit: values => write.save(rulesBody(values, config)),
  })
  return (
    <SettingsPage
      title={m.admin_gamification_title()}
      nav={
        <Link to="/admin/gamification" hash="rules" variant="tab" activeOptions={{ includeHash: true }}>
          {m.admin_gamification_rules()}
        </Link>
      }
    >
      <div id="rules">
        <SettingsSection
          title={m.admin_gamification_rules()}
          description={m.admin_gamification_rules_hint()}
          onSubmit={() => form.handleSubmit()}
          pending={update.isPending}
          error={isStale(update.error) ? null : update.error}
        >
          <form.AppField name="daily_xp_limit">
            {field => <field.TextField label={m.admin_gamification_daily_limit()} inputMode="numeric" />}
          </form.AppField>
          {REWARD_SOURCES.map(source => (
            <form.AppField key={source} name={`rewards.${source}`}>
              {field => <field.TextField label={rewardLabels[source]()} inputMode="numeric" />}
            </form.AppField>
          ))}
        </SettingsSection>
        <ConflictDialog {...write.dialog} />
      </div>
    </SettingsPage>
  )
}
