import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { hasCapability } from '#/shared/auth/access'
import { sessionOptions } from '#/shared/auth/session'
import { formatNumber } from '#/shared/i18n/format'

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
          <FeatureRow key={feature.key} feature={feature} canSwitch={canSwitch} />
        ))}
      </ul>
    </section>
  )
}
