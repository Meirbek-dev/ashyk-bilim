import SettingsHeader from '@components/Dashboard/Misc/SettingsHeader'
import DesktopOnlyGuard from '@components/Dashboard/Misc/DesktopOnlyGuard'
import UsersSettingsTabs from './users-settings-tabs'
import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

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
