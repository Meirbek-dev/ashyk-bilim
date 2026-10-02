import { Outlet, useMatch } from '@tanstack/react-router'

import { SettingsPage } from '#/shared/ui/templates/settings-page'

import { TabLinks } from './tab-links'

/** The settings layout route: its sections are routes, listed in staticData.tabs. */
export function SettingsLayout() {
  const { staticData } = useMatch({ strict: false })
  return (
    <SettingsPage title={staticData.title?.() ?? ''} nav={<TabLinks tabs={staticData.tabs ?? []} />}>
      <Outlet />
    </SettingsPage>
  )
}
