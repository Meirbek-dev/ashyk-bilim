'use client';

import { Actions, Resources, Scopes } from '@/components/Security';
import { useSession } from '@/hooks/useSession';
import UserGroups from '@/components/Dashboard/Pages/Users/UserGroups/UserGroups';
import DesktopOnlyGuard from '@components/Dashboard/Misc/DesktopOnlyGuard';
import SettingsHeader from '@components/Dashboard/Misc/SettingsHeader';
import Users from '@/components/Dashboard/Pages/Users/Users/Users';
import SettingsTabs from '@components/Dashboard/Misc/SettingsTabs';
import { SquareUserRound, UsersIcon } from 'lucide-react';
import { getAbsoluteUrl } from '@services/config/config';
import { Suspense, use, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';

export interface SettingsParams {
  subpage: string;
}

type SubpageType = 'users' | 'usergroups';

interface TabConfig {
  id: SubpageType;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  labelKey: string;
  titleKey: string;
  descriptionKey: string;
  component: React.ComponentType;
}

export default function PlatformUsersSettingsPage(props: { params: Promise<{ subpage: string }> }) {
  return (
    <Suspense fallback={null}>
      <PlatformUsersSettingsPageContent {...props} />
    </Suspense>
  );
}

function PlatformUsersSettingsPageContent(props: { params: Promise<{ subpage: string }> }) {
  const params = use(props.params);
  const router = useRouter();
  const t = useTranslations('DashPage.UserSettings');
  const { can } = useSession();

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
  );

  useEffect(() => {
    if (params.subpage !== 'roles') return;
    router.replace(`${getAbsoluteUrl('')}/dash/admin/roles`);
  }, [params.subpage, router]);

  const tabs = useMemo(
    () =>
      allTabs.filter((tab) => {
        switch (tab.id) {
          case 'users': {
            return (
              can(Resources.USER, Actions.READ, Scopes.PLATFORM) || can(Resources.USER, Actions.UPDATE, Scopes.PLATFORM)
            );
          }
          case 'usergroups': {
            return can(Resources.USERGROUP, Actions.MANAGE, Scopes.PLATFORM);
          }
          default: {
            return true;
          }
        }
      }),
    [allTabs, can],
  );

  const currentTab: TabConfig = useMemo(
    () => tabs.find((tab) => tab.id === params.subpage) ?? tabs[0]!,
    [tabs, params.subpage],
  );

  const ActiveComponent = currentTab.component;

  return (
    <DesktopOnlyGuard>
      <div className="bg-background flex h-screen w-full flex-col">
        <SettingsHeader
          breadcrumbType="platformusers"
          title={t(currentTab.titleKey)}
          description={t(currentTab.descriptionKey)}
        >
          <SettingsTabs
            value={params.subpage}
            tabs={tabs}
            getHref={(tab) => `${getAbsoluteUrl('')}/dash/users/settings/${tab.id}`}
            translationNamespace="DashPage.UserSettings"
          />
        </SettingsHeader>

        <ActiveComponent />
      </div>
    </DesktopOnlyGuard>
  );
}
