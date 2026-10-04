import { useSuspenseQuery } from '@tanstack/react-query'
import { useState } from 'react'

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
  // Both sections write the platform: they share the version their forms are based on.
  const base = useState(platform.version)
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
        <PlatformGeneral platform={platform} base={base} />
      </div>
      <div id="branding">
        <PlatformBranding platform={platform} base={base} />
      </div>
    </SettingsPage>
  )
}
