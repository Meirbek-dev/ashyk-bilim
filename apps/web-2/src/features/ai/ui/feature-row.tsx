import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CircleCheck, CircleMinus } from 'lucide-react'
import { useId } from 'react'

import { m } from '#/paraglide/messages'
import type { FeatureSetting } from '#/shared/api/gen/types.gen'
import { presentError } from '#/shared/i18n/errors'
import { Switch } from '#/shared/ui/switch'
import { toast } from '#/shared/ui/toast'

import { featureLabel, sourceLabel } from '../model/labels'
import { featureSwitchOptions } from '../queries'

/** Yes / no as an icon and the word: «yes» in success, «no» quiet; not a pill per line. */
export const flag = (on: boolean) => (
  <span className={`inline-flex items-center gap-1.5 ${on ? 'text-success' : 'text-muted-foreground'}`}>
    {on ? <CircleCheck aria-hidden className="size-4" /> : <CircleMinus aria-hidden className="size-4" />}
    {on ? m.ai_yes() : m.ai_no()}
  </span>
)

/** One AI feature: a switch for a platform editor where the environment allows it (B-AI-25), else yes/no. */
type FeatureRowProps = {
  feature: FeatureSetting
  canSwitch: boolean
  /** The list names the source once when every feature shares it; then the row does not repeat it. */
  showSource: boolean
}

export function FeatureRow({ feature, canSwitch, showSource }: FeatureRowProps) {
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
    <li className="flex min-h-row flex-col justify-center gap-1 py-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span id={labelId}>{featureLabel(feature.key)}</span>
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          {showSource ? m.ai_feature_source({ source: sourceLabel(feature.source) }) : null}
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
