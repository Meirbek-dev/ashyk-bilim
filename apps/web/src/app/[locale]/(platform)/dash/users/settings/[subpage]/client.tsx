'use client'

import { Actions, Resources, Scopes } from '@/components/Security'
import { useSession } from '@/hooks/useSession'
import UserGroups from '@/components/Dashboard/Pages/Users/UserGroups/UserGroups'
import DesktopOnlyGuard from '@components/Dashboard/Misc/DesktopOnlyGuard'
import SettingsHeader from '@components/Dashboard/Misc/SettingsHeader'
import Users from '@/components/Dashboard/Pages/Users/Users/Users'
import SettingsTabs from '@components/Dashboard/Misc/SettingsTabs'
import { SquareUserRound, UsersIcon } from 'lucide-react'
import { getAbsoluteUrl } from '@services/config/config'
import { useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'

type SubpageType = 'users' | 'usergroups'

interface TabConfig {
  id: SubpageType
  icon: React.ComponentType<{ size?: number; className?: string }>
  labelKey: string
  titleKey: string
  descriptionKey: string
  component: React.ComponentType
}

export default function PlatformUsersSettingsClient({ subpage }: { subpage: string }) {
  const router = useRouter()
  const t = useTranslations('DashPage.UserSettings')
  const { can } = useSession()

  const allTabs: TabConfig[] = useMemo(
    () => [
      {
        id: 'users',
        icon: UsersIcon,
        labelKey: 'users',
        titleKey: 'usersTitle',
        descriptionKey: 'usersDescription',
        component: Users,
      },
      {
        id: 'usergroups',
        icon: SquareUserRound,
        labelKey: 'usergroups',
        titleKey: 'usergroupsTitle',
        descriptionKey: 'usergroupsDescription',
        component: UserGroups,
      },
    ],
    [],
  )

  useEffect(() => {
    if (subpage !== 'roles') return
    router.replace(`${getAbsoluteUrl('')}/dash/admin/roles`)
  }, [subpage, router])

  const tabs = useMemo(
    () =>
      allTabs.filter(tab => {
        switch (tab.id) {
          case 'users': {
            return (
              can(Resources.USER, Actions.READ, Scopes.APP) ||
              can(Resources.USER, Actions.UPDATE, Scopes.APP)
            )
          }
          case 'usergroups': {
            return can(Resources.USERGROUP, Actions.MANAGE, Scopes.APP)
          }
          default: {
            return true
          }
        }
      }),
    [allTabs, can],
  )

  const currentTab = useMemo(() => tabs.find(tab => tab.id === subpage) ?? tabs[0], [tabs, subpage])
  const ActiveComponent = currentTab?.component

  return (
    <DesktopOnlyGuard>
      <div className="bg-background flex h-screen w-full flex-col">
        <SettingsHeader
          breadcrumbType="platformusers"
          title={currentTab ? t(currentTab.titleKey) : t('usersTitle')}
          description={currentTab ? t(currentTab.descriptionKey) : t('usersDescription')}
        >
          <SettingsTabs
            value={subpage}
            tabs={tabs}
            getHref={tab => `${getAbsoluteUrl('')}/dash/users/settings/${tab.id}`}
            translationNamespace="DashPage.UserSettings"
          />
        </SettingsHeader>

        {ActiveComponent ? <ActiveComponent /> : null}
      </div>
    </DesktopOnlyGuard>
  )
}
