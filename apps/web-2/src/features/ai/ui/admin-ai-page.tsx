import { useSearch } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'
import { SettingsPage } from '#/shared/components/templates/settings-page'

import { AdminEvals } from './admin-evals'
import { AdminRuns } from './admin-runs'
import { AdminSettings } from './admin-settings'
import { AdminUsage } from './admin-usage'

const tab = (hash: string, label: string) => (
  <Link from="/admin/ai" to="." search={prev => prev} hash={hash} variant="tab" activeOptions={{ includeHash: true }}>
    {label}
  </Link>
)

/** `/admin/ai` (B-AI-20..23): settings, usage and budget, runs, quality evals; the nav jumps between them. */
export function AdminAiPage() {
  const search = useSearch({ from: '/_authed/admin/ai' })
  return (
    <SettingsPage
      title={m.ai_admin_title()}
      nav={
        <>
          {tab('settings', m.ai_admin_settings())}
          {tab('usage', m.ai_admin_usage())}
          {tab('runs', m.ai_admin_runs())}
          {tab('evals', m.ai_admin_evals())}
        </>
      }
    >
      <AdminSettings />
      <AdminUsage />
      <AdminRuns search={search} />
      <AdminEvals />
    </SettingsPage>
  )
}
