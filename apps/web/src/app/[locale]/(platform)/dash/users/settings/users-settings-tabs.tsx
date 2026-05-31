'use client'

import SettingsTabs from '@components/Dashboard/Misc/SettingsTabs'
import { Actions, Resources, Scopes } from '@/components/Security'
import { useSession } from '@/hooks/useSession'
import { SquareUserRound, UsersIcon } from 'lucide-react'
import { useMemo } from 'react'

const ALL_TABS = [
  { id: 'users' as const, labelKey: 'users', icon: UsersIcon },
  { id: 'usergroups' as const, labelKey: 'usergroups', icon: SquareUserRound },
]

export default function UsersSettingsTabs() {
  const { can } = useSession()

  const tabs = useMemo(
    () =>
      ALL_TABS.filter(tab => {
        switch (tab.id) {
          case 'users':
            return can(Resources.USER, Actions.READ, Scopes.APP) || can(Resources.USER, Actions.UPDATE, Scopes.APP)
          case 'usergroups':
            return can(Resources.USERGROUP, Actions.MANAGE, Scopes.APP)
          default:
            return true
        }
      }),
    [can],
  )

  return (
    <SettingsTabs
      tabs={tabs}
      getHref={tab => `/dash/users/settings/${tab.id}`}
      translationNamespace="DashPage.UserSettings"
    />
  )
}
