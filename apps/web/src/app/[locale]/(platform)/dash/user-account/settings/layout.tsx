'use client'

import SettingsHeader from '@components/Dashboard/Misc/SettingsHeader'
import SettingsTabs from '@components/Dashboard/Misc/SettingsTabs'
import { Info, Lock, Trophy, User as UserIcon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

const TABS = [
  { id: 'general', labelKey: 'general', icon: Info },
  { id: 'profile', labelKey: 'profile', icon: UserIcon },
  { id: 'gamification', labelKey: 'gamification', icon: Trophy },
  { id: 'security', labelKey: 'password', icon: Lock },
]

export default function UserAccountSettingsLayout({ children }: { children: ReactNode }) {
  const t = useTranslations('DashPage.UserAccountSettings')

  return (
    <div className="flex h-full w-full flex-col">
      <SettingsHeader breadcrumbType="user" title={t('title')}>
        <SettingsTabs
          tabs={TABS}
          getHref={tab => `/dash/user-account/settings/${tab.id}`}
          translationNamespace="DashPage.UserAccountSettings"
        />
      </SettingsHeader>
      <div className="h-6 shrink-0" />
      {children}
    </div>
  )
}
