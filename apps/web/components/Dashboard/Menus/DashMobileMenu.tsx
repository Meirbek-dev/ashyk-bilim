'use client';

import { Backpack, BarChart3, BookCopy, Home, School, Settings, ShieldCheck, Users } from 'lucide-react';
import { useNavigationPermissions } from '@/hooks/useNavigationPermissions';
import { useSession } from '@/hooks/useSession';
import ToolTip from '@/components/Objects/Elements/Tooltip/Tooltip';
import AppLink from '@/components/ui/AppLink';
import { useTranslations } from 'next-intl';

const DashMobileMenu = () => {
  const { user: currentUser } = useSession();
  const t = useTranslations('SidebarMenu');
  const { canSeePlatform, canSeeCourses, canSeeAssignments, canSeeAnalytics, canSeeUsers, canSeeAdmin } =
    useNavigationPermissions();

  return (
    <div className="border-sidebar-border bg-sidebar text-sidebar-foreground supports-[backdrop-filter]:bg-sidebar/90 fixed right-0 bottom-0 left-0 z-50 border-t shadow-lg supports-[backdrop-filter]:backdrop-blur-md">
      <div className="flex h-16 items-center justify-around px-2">
        <ToolTip
          content={t('tooltips.home')}
          slateBlack
          sideOffset={8}
          side="top"
        >
          <AppLink
            href="/"
            className="flex flex-col items-center p-2"
            aria-label={t('ariaLabels.home')}
          >
            <Home size={20} />
            <span className="mt-1 text-xs">{t('mobile.home')}</span>
          </AppLink>
        </ToolTip>
        {canSeeCourses ? (
          <ToolTip
            content={t('tooltips.courses')}
            slateBlack
            sideOffset={8}
            side="top"
          >
            <AppLink
              href="/dash/courses"
              className="flex flex-col items-center p-2"
              aria-label={t('ariaLabels.manageCourses')}
            >
              <BookCopy size={20} />
              <span className="mt-1 text-xs">{t('mobile.courses')}</span>
            </AppLink>
          </ToolTip>
        ) : null}
        {canSeeAssignments ? (
          <ToolTip
            content={t('tooltips.assignments')}
            slateBlack
            sideOffset={8}
            side="top"
          >
            <AppLink
              href="/dash/assignments"
              className="flex flex-col items-center p-2"
              aria-label={t('ariaLabels.manageAssignments')}
            >
              <Backpack size={20} />
              <span className="mt-1 text-xs">{t('mobile.assignments')}</span>
            </AppLink>
          </ToolTip>
        ) : null}
        {canSeeAnalytics ? (
          <ToolTip
            content={t('tooltips.analytics')}
            slateBlack
            sideOffset={8}
            side="top"
          >
            <AppLink
              href="/dash/analytics"
              className="flex flex-col items-center p-2"
              aria-label={t('ariaLabels.manageAnalytics')}
            >
              <BarChart3 size={20} />
              <span className="mt-1 text-xs">{t('mobile.analytics')}</span>
            </AppLink>
          </ToolTip>
        ) : null}
        {canSeeUsers ? (
          <ToolTip
            content={t('tooltips.users')}
            slateBlack
            sideOffset={8}
            side="top"
          >
            <AppLink
              href="/dash/users/settings/users"
              className="flex flex-col items-center p-2"
              aria-label={t('ariaLabels.manageUsers')}
            >
              <Users size={20} />
              <span className="mt-1 text-xs">{t('mobile.users')}</span>
            </AppLink>
          </ToolTip>
        ) : null}
        {canSeePlatform ? (
          <ToolTip
            content={t('tooltips.platform')}
            slateBlack
            sideOffset={8}
            side="top"
          >
            <AppLink
              href="/dash/platform/settings/landing"
              className="flex flex-col items-center p-2"
              aria-label={t('ariaLabels.platformSettings')}
            >
              <School size={20} />
              <span className="mt-1 text-xs">{t('mobile.platform')}</span>
            </AppLink>
          </ToolTip>
        ) : null}
        {canSeeAdmin ? (
          <ToolTip
            content={t('tooltips.admin')}
            slateBlack
            sideOffset={8}
            side="top"
          >
            <AppLink
              href="/dash/admin"
              className="flex flex-col items-center p-2"
              aria-label={t('ariaLabels.admin')}
            >
              <ShieldCheck size={20} />
              <span className="mt-1 text-xs">{t('mobile.admin')}</span>
            </AppLink>
          </ToolTip>
        ) : null}
        <ToolTip
          content={t('tooltips.userSettings', {
            username: currentUser?.username ?? '',
          })}
          slateBlack
          sideOffset={8}
          side="top"
        >
          <AppLink
            href="/dash/user-account/settings/general"
            className="flex flex-col items-center p-2"
            aria-label={t('ariaLabels.userAccountSettings')}
          >
            <Settings size={20} />
            <span className="mt-1 text-xs">{t('mobile.settings')}</span>
          </AppLink>
        </ToolTip>
      </div>
    </div>
  );
};

export default DashMobileMenu;
