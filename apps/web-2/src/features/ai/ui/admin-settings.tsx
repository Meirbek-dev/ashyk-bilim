import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { hasCapability } from '#/shared/auth/access'
import { sessionOptions } from '#/shared/auth/session'
import { formatNumber } from '#/shared/i18n/format'

import { sourceLabel } from '../model/labels'
import { settingsOptions } from '../queries'
import { FeatureRow, flag } from './feature-row'

/**
 * The effective AI settings and the feature switches (B-AI-20). A platform editor (`admin.platform`) turns a feature
 * on and off where the environment allows it (`editable`, B-AI-25); everyone else reads them.
 */
export function AdminSettings() {
  const { data: settings } = useSuspenseQuery(settingsOptions())
  const { data: session } = useSuspenseQuery(sessionOptions())
  const canSwitch = hasCapability(session, 'admin.platform')
  const sources = new Set(settings.features.map(feature => feature.source))
  const source = sources.size === 1 ? (settings.features[0]?.source ?? null) : null
  return (
    <section id="settings" className="flex max-w-prose flex-col gap-4">
      <h2 className="text-xl font-semibold">{m.ai_admin_settings()}</h2>
      <dl className="flex flex-col divide-y border-y text-sm">
        {[
          { label: m.ai_enabled(), value: flag(settings.ai_enabled) },
          { label: m.ai_provider_ready(), value: flag(settings.provider_ready) },
          { label: m.ai_draft_mode(), value: flag(settings.draft_mode_enabled) },
        ].map(row => (
          <div key={row.label} className="flex min-h-row items-center justify-between gap-4 py-1">
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-sm text-muted-foreground">
        {[
          m.ai_model({ model: settings.model }),
          m.ai_max_request({ count: formatNumber(settings.max_tokens_per_request) }),
          m.ai_max_output({ count: formatNumber(settings.max_output_tokens) }),
        ].join(' · ')}
      </p>
      <div className="flex flex-col gap-1">
        <h3 className="font-medium">{m.ai_features()}</h3>
        {/* «…по настройкам сервера» beside working switches read as if they could not be changed: say what one does. */}
        {source || canSwitch ? (
          <p className="text-sm text-muted-foreground">
            {[
              source ? m.ai_features_source_all({ source: sourceLabel(source) }) : '',
              canSwitch ? m.ai_features_switch_hint() : '',
            ]
              .filter(Boolean)
              .join(' ')}
          </p>
        ) : null}
      </div>
      <ul className="flex flex-col divide-y border-y text-sm">
        {settings.features.map(feature => (
          <FeatureRow key={feature.key} feature={feature} canSwitch={canSwitch} showSource={source === null} />
        ))}
      </ul>
    </section>
  )
}
