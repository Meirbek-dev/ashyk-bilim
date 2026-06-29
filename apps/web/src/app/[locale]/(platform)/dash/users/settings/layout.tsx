import SettingsHeader from '@components/Dashboard/Misc/SettingsHeader'
import DesktopOnlyGuard from '@components/Dashboard/Misc/DesktopOnlyGuard'
import UsersSettingsTabs from './users-settings-tabs'
import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

// TODO: Cache Components adoption. Refactor this route so this opt-out can be removed.
// See: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false

export default async function UsersSettingsLayout({ children }: { children: ReactNode }) {
  const t = await getTranslations('DashPage.UserSettings')

  return (
    <DesktopOnlyGuard>
      <div className="bg-background flex h-screen w-full flex-col">
        <SettingsHeader breadcrumbType="platformusers" title={t('usersTitle')}>
          <UsersSettingsTabs />
        </SettingsHeader>

        {children}
      </div>
    </DesktopOnlyGuard>
  )
}
