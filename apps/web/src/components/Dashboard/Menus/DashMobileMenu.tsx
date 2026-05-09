'use client';

import { Backpack, BarChart3, BookCopy, Home, School, Settings, ShieldCheck, Users } from 'lucide-react';
import { useNavigationPermissions } from '@/hooks/useNavigationPermissions';
import AppLink from '@/components/ui/AppLink';
import { cn } from '@/lib/utils';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import type { LucideIcon } from 'lucide-react';

const DashMobileMenu = () => {
  const pathname = usePathname();
  const t = useTranslations('SidebarMenu');
  const { canSeePlatform, canSeeCourses, canSeeAssignments, canSeeAnalytics, canSeeUsers, canSeeAdmin } =
    useNavigationPermissions();

  const navigationItems: {
    href: string;
    icon: LucideIcon;
    label: string;
    tooltip: string;
    isActive: boolean;
  }[] = [
    {
      href: '/dash',
      icon: Home,
      label: t('mobile.home'),
      tooltip: t('tooltips.home'),
      isActive: pathname === '/dash',
    },
    ...(canSeeCourses
      ? [
          {
            href: '/dash/courses',
            icon: BookCopy,
            label: t('mobile.courses'),
            tooltip: t('tooltips.courses'),
            isActive: pathname.startsWith('/dash/courses'),
          },
        ]
      : []),
    ...(canSeeAssignments
      ? [
          {
            href: '/dash/courses',
            icon: Backpack,
            label: t('mobile.assignments'),
            tooltip: t('tooltips.assignments'),
            isActive: pathname.startsWith('/dash/courses'),
          },
        ]
      : []),
    ...(canSeeAnalytics
      ? [
          {
            href: '/dash/analytics',
            icon: BarChart3,
            label: t('mobile.analytics'),
            tooltip: t('tooltips.analytics'),
            isActive: pathname.startsWith('/dash/analytics'),
          },
        ]
      : []),
    ...(canSeeUsers
      ? [
          {
            href: '/dash/users/settings/users',
            icon: Users,
            label: t('mobile.users'),
            tooltip: t('tooltips.users'),
            isActive: pathname.startsWith('/dash/users'),
          },
        ]
      : []),
    ...(canSeePlatform
      ? [
          {
            href: '/dash/platform/settings/landing',
            icon: School,
            label: t('mobile.platform'),
            tooltip: t('tooltips.platform'),
            isActive: pathname.startsWith('/dash/platform'),
          },
        ]
      : []),
    ...(canSeeAdmin
      ? [
          {
            href: '/dash/admin',
            icon: ShieldCheck,
            label: t('mobile.admin'),
            tooltip: t('tooltips.admin'),
            isActive: pathname.startsWith('/dash/admin'),
          },
        ]
      : []),
    {
      href: '/dash/user-account/settings/general',
      icon: Settings,
      label: t('mobile.settings'),
      tooltip: t('ariaLabels.userAccountSettings'),
      isActive: pathname.startsWith('/dash/user-account'),
    },
  ];

  return (
    <div className="border-border/80 bg-background/95 supports-[backdrop-filter]:bg-background/90 fixed inset-x-0 bottom-0 z-50 border-t shadow-[0_-10px_30px_rgba(15,23,42,0.08)] supports-[backdrop-filter]:backdrop-blur">
      <div className="mx-auto w-full max-w-screen-sm px-2 pt-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)]">
        <nav className="no-scrollbar grid auto-cols-[minmax(4.5rem,1fr)] grid-flow-col gap-1 overflow-x-auto">
          {navigationItems.map((item) => {
            const Icon = item.icon;

            return (
              <AppLink
                key={item.label}
                href={item.href}
                aria-label={item.tooltip}
                aria-current={item.isActive ? 'page' : undefined}
                title={item.tooltip}
                className={cn(
                  'focus-visible:ring-ring/50 flex min-h-14 min-w-[4.5rem] flex-col items-center justify-center rounded-2xl px-3 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2',
                  item.isActive
                    ? 'bg-accent text-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full transition-colors',
                    item.isActive ? 'bg-background text-foreground' : 'text-muted-foreground',
                  )}
                >
                  <Icon size={18} />
                </span>
                <span className="mt-1 truncate text-[11px] leading-tight font-medium">{item.label}</span>
              </AppLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
};

export default DashMobileMenu;
