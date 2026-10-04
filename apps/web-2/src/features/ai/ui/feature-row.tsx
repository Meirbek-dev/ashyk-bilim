import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useId } from 'react'

import { m } from '#/paraglide/messages'
import type { FeatureSetting } from '#/shared/api/gen/types.gen'
import { StatusBadge } from '#/shared/components/status-badge'
import { presentError } from '#/shared/i18n/errors'
import { Switch } from '#/shared/ui/switch'
import { toast } from '#/shared/ui/toast'

import { featureLabel, sourceLabel } from '../model/labels'
import { featureSwitchOptions } from '../queries'

export const flag = (on: boolean) => (
  <StatusBadge tone={on ? 'success' : 'neutral'}>{on ? m.ai_yes() : m.ai_no()}</StatusBadge>
)

/** One AI feature: a switch for a platform editor where the environment allows it (B-AI-25), else yes/no. */
export function FeatureRow({ feature, canSwitch }: { feature: FeatureSetting; canSwitch: boolean }) {
  const labelId = useId()
  const toggle = useMutation(featureSwitchOptions(useQueryClient()))
  const set = (enabled: boolean) =>
    toggle.mutate(
      { path: { key: feature.key }, body: { enabled } },
      {
        onSuccess: () =>
          toast.add({
            title: (enabled ? m.ai_feature_switched_on : m.ai_feature_switched_off)({
              name: featureLabel(feature.key),
            }),
          }),
      },
    )
  return (
    <li className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span id={labelId}>{featureLabel(feature.key)}</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {m.ai_feature_source({ source: sourceLabel(feature.source) })}
          {canSwitch ? (
            <Switch
              aria-labelledby={labelId}
              checked={feature.enabled}
              disabled={!feature.editable || toggle.isPending}
              onCheckedChange={set}
            />
          ) : (
            flag(feature.enabled)
          )}
        </span>
      </div>
      {canSwitch && !feature.editable ? (
        <span className="text-xs text-muted-foreground">{m.ai_feature_locked()}</span>
      ) : null}
      {toggle.error ? (
        <span role="alert" className="text-sm text-destructive">
          {presentError(toggle.error)}
        </span>
      ) : null}
    </li>
  )
}
