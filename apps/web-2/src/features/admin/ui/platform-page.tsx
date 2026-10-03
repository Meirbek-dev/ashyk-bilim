import { useSuspenseQuery } from '@tanstack/react-query'

import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'
import { SettingsPage } from '#/shared/components/templates/settings-page'

import { platformOptions } from '../queries'
import { PlatformBranding } from './platform-branding'
import { PlatformGeneral } from './platform-general'

const tab = (hash: string, label: string) => (
  <Link to="/admin/platform" hash={hash} variant="tab" activeOptions={{ includeHash: true }}>
    {label}
  </Link>
)

/** Platform settings (`GET` / `PATCH /platform`): two sections, each saved on its own; the nav jumps between them. */
export function PlatformPage() {
  const { data: platform } = useSuspenseQuery(platformOptions())
  return (
    <SettingsPage
      title={m.admin_platform_title()}
      nav={
        <>
          {tab('general', m.admin_section_general())}
          {tab('branding', m.admin_platform_branding())}
        </>
      }
    >
      <div id="general">
        <PlatformGeneral platform={platform} />
      </div>
      <div id="branding">
        <PlatformBranding platform={platform} />
      </div>
    </SettingsPage>
  )
}
