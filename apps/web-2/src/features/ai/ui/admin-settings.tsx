import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { StatusBadge } from '#/shared/components/status-badge'
import { formatNumber } from '#/shared/i18n/format'

import { featureLabel } from '../model/labels'
import { settingsOptions } from '../queries'

const flag = (on: boolean) => <StatusBadge tone={on ? 'success' : 'neutral'}>{on ? m.ai_yes() : m.ai_no()}</StatusBadge>

/** The effective AI settings and the feature switches, read-only: the contract has no write (B-AI-20). */
export function AdminSettings() {
  const { data: settings } = useSuspenseQuery(settingsOptions())
  return (
    <section id="settings" className="flex max-w-prose flex-col gap-4">
      <h2 className="text-xl font-semibold">{m.ai_admin_settings()}</h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt>{m.ai_enabled()}</dt>
        <dd>{flag(settings.ai_enabled)}</dd>
        <dt>{m.ai_provider_ready()}</dt>
        <dd>{flag(settings.provider_ready)}</dd>
        <dt>{m.ai_draft_mode()}</dt>
        <dd>{flag(settings.draft_mode_enabled)}</dd>
      </dl>
      <ul className="flex flex-col gap-1 text-sm text-muted-foreground">
        <li>{m.ai_model({ model: settings.model })}</li>
        <li>{m.ai_max_request({ count: formatNumber(settings.max_tokens_per_request) })}</li>
        <li>{m.ai_max_output({ count: formatNumber(settings.max_output_tokens) })}</li>
      </ul>
      <h3 className="font-medium">{m.ai_features()}</h3>
      <ul className="flex flex-col gap-2 text-sm">
        {settings.features.map(feature => (
          <li key={feature.key} className="flex flex-wrap items-center justify-between gap-2">
            <span>{featureLabel(feature.key)}</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {m.ai_feature_source({ source: feature.source })}
              {flag(feature.enabled)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
