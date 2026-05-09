'use client';

import UserGamificationSettings from '@components/Dashboard/Pages/UserAccount/UserGamificationSettings/UserGamificationSettings';
import UserEditPassword from '@components/Dashboard/Pages/UserAccount/UserEditPassword/UserEditPassword';
import UserEditGeneral from '@components/Dashboard/Pages/UserAccount/UserEditGeneral/UserEditGeneral';
import UserProfile from '@components/Dashboard/Pages/UserAccount/UserProfile/UserProfile';
import SettingsHeader from '@components/Dashboard/Misc/SettingsHeader';
import { Info, Lock, Trophy, User as UserIcon } from 'lucide-react';
import SettingsTabs from '@components/Dashboard/Misc/SettingsTabs';
import { getAbsoluteUrl } from '@services/config/config';
import type { LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ComponentType } from 'react';
import { Suspense, use, useMemo } from 'react';

export interface SettingsParams {
  subpage: string;
}

interface NavigationItem {
  id: string;
  label: string;
  icon: LucideIcon;
  component: ComponentType;
}

export default function PlatformUserSettingsPage(props: { params: Promise<{ subpage: string }> }) {
  return (
    <Suspense fallback={null}>
      <PlatformUserSettingsPageContent {...props} />
    </Suspense>
  );
}

function PlatformUserSettingsPageContent(props: { params: Promise<{ subpage: string }> }) {
  const t = useTranslations('DashPage.UserAccountSettings');
  const { subpage } = use(props.params);

  const navigationItems: NavigationItem[] = useMemo(
    () => [
      { id: 'general', label: 'general', icon: Info, component: UserEditGeneral },
      { id: 'profile', label: 'profile', icon: UserIcon, component: UserProfile },
      {
        id: 'gamification',
        label: 'gamification',
        icon: Trophy,
        component: UserGamificationSettings,
      },
      { id: 'security', label: 'password', icon: Lock, component: UserEditPassword },
    ],
    [],
  );

  const tabs = useMemo(
    () => navigationItems.map((it) => ({ id: it.id, labelKey: it.label, icon: it.icon })),
    [navigationItems],
  );

  const CurrentComponent = navigationItems.find((item) => item.id === subpage)?.component;

  return (
    <div className="flex h-full w-full flex-col">
      <SettingsHeader
        breadcrumbType="user"
        title={t('title')}
      >
        <SettingsTabs
          value={subpage}
          tabs={tabs}
          getHref={(tab) => `${getAbsoluteUrl('')}/dash/user-account/settings/${tab.id}`}
          translationNamespace="DashPage.UserAccountSettings"
        />
      </SettingsHeader>
      <div className="h-6 shrink-0" />

      {CurrentComponent ? <CurrentComponent /> : null}
    </div>
  );
}
