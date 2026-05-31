'use client'

import SettingsHeader from '@components/Dashboard/Misc/SettingsHeader'
import SettingsTabs from '@components/Dashboard/Misc/SettingsTabs'
import { ImageIcon, LayoutDashboardIcon, Share2Icon } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'
import { Separator } from '@/components/ui/separator'

const TABS = [
  { id: 'landing', labelKey: 'landing', icon: LayoutDashboardIcon },
  { id: 'previews', labelKey: 'previews', icon: ImageIcon },
  { id: 'socials', labelKey: 'socials', icon: Share2Icon },
]

export default function PlatformSettingsLayout({ children }: { children: ReactNode }) {
  const tCard = useTranslations('DashPage.Card.Platform')

  return (
    <div className="bg-background flex h-full w-full flex-col">
      <SettingsHeader breadcrumbType="platform" title={tCard('title')}>
        <SettingsTabs
          tabs={TABS}
          getHref={tab => `/dash/platform/settings/${tab.id}`}
          translationNamespace="DashPage.PlatformSettings"
        />
      </SettingsHeader>

      <Separator />

      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto py-6 lg:py-8">
          <div className="overflow-hidden rounded-3xl border shadow-sm">
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}
