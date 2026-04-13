'use client';

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Backpack, BarChart3, BookCopy, Home, LogOut, School, Settings, ShieldCheck, Users } from 'lucide-react';
import { useNavigationPermissions } from '@/hooks/useNavigationPermissions';
import { useSession } from '@/hooks/useSession';
import platformLogoLight from '@public/platform_logo_light.svg';
import { logout } from '@services/auth/auth';
import { getAbsoluteUrl } from '@services/config/config';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import UserAvatar from '../../Objects/UserAvatar';
import { useEffect, useEffectEvent } from 'react';
import AppLink from '@/components/ui/AppLink';
import { Badge } from '@/components/ui/badge';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Image from 'next/image';

interface NavigationItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ 'className'?: string; 'aria-hidden'?: boolean }>;
  tooltip: string;
  isActive?: boolean;
  badge?: string | number;
  disabled?: boolean;
}

interface SidebarProps {
  className?: string;
}

// Loading skeleton component
const SidebarSkeleton = () => (
  <Sidebar
    side="left"
    variant="sidebar"
    collapsible="icon"
    className="border-r"
  >
    <SidebarHeader className="border-sidebar-border border-b p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 w-10 rounded-lg" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </SidebarHeader>
    <SidebarContent className="p-4">
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton
            key={i}
            className="h-10 w-full rounded-md"
          />
        ))}
      </div>
    </SidebarContent>
    <SidebarFooter className="border-sidebar-border border-t p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-8 rounded-full" />
        <div className="flex-1 space-y-1">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-16" />
        </div>
      </div>
    </SidebarFooter>
  </Sidebar>
);

// Custom hook for navigation items
const useNavigationItems = () => {
  const pathname = usePathname();
  const t = useTranslations('SidebarMenu');
  const { canSeePlatform, canSeeCourses, canSeeAssignments, canSeeAnalytics, canSeeUsers, canSeeAdmin } =
    useNavigationPermissions();

  return [
    {
      title: t('tooltips.home'),
      href: '/dash',
      icon: Home,
      tooltip: t('tooltips.home'),
      isActive: pathname === '/dash',
    },
    ...(canSeeCourses
      ? [
          {
            title: t('tooltips.courses'),
            href: '/dash/courses',
            icon: BookCopy,
            tooltip: t('tooltips.courses'),
            isActive: pathname.startsWith('/dash/courses'),
          },
        ]
      : []),
    ...(canSeeAssignments
      ? [
          {
            title: t('tooltips.assignments'),
            href: '/dash/assignments',
            icon: Backpack,
            tooltip: t('tooltips.assignments'),
            isActive: pathname.startsWith('/dash/assignments'),
          },
        ]
      : []),
    ...(canSeeAnalytics
      ? [
          {
            title: t('tooltips.analytics'),
            href: '/dash/analytics',
            icon: BarChart3,
            tooltip: t('tooltips.analytics'),
            isActive: pathname.startsWith('/dash/analytics'),
          },
        ]
      : []),
    ...(canSeeUsers
      ? [
          {
            title: t('tooltips.users'),
            href: '/dash/users/settings/users',
            icon: Users,
            tooltip: t('tooltips.users'),
            isActive: pathname.startsWith('/dash/users'),
          },
        ]
      : []),
    ...(canSeePlatform
      ? [
          {
            title: t('tooltips.platform'),
            href: '/dash/platform/settings/landing',
            icon: School,
            tooltip: t('tooltips.platform'),
            isActive: pathname.startsWith('/dash/platform'),
          },
        ]
      : []),
    ...(canSeeAdmin
      ? [
          {
            title: t('tooltips.admin'),
            href: '/dash/admin',
            icon: ShieldCheck,
            tooltip: t('tooltips.admin'),
            isActive: pathname.startsWith('/dash/admin'),
          },
        ]
      : []),
  ];
};

// Navigation item component
const NavItem = ({ item, isCollapsed }: { item: NavigationItem; isCollapsed: boolean }) => (
  <SidebarMenuItem className={isCollapsed ? 'flex w-full justify-center' : ''}>
    <SidebarMenuButton
      render={
        <AppLink
          href={item.href}
          aria-label={item.tooltip}
          aria-current={item.isActive ? 'page' : undefined}
        />
      }
      tooltip={isCollapsed ? item.tooltip : undefined}
      isActive={item.isActive}
      size="default"
      className={`group hover:bg-sidebar-accent/50 relative transition-all duration-200 ${
        isCollapsed ? 'flex h-10 w-10 items-center justify-center p-0' : 'w-full gap-3'
      } flex min-w-0 items-center`}
      disabled={item.disabled}
    >
      <item.icon
        className="h-4 w-4 shrink-0"
        aria-hidden
      />
      {!isCollapsed && (
        <>
          <span className="truncate font-medium">{item.title}</span>
          {item.badge ? (
            <Badge
              variant="secondary"
              className="ml-auto text-xs"
            >
              {item.badge}
            </Badge>
          ) : null}
          {item.isActive ? <div className="bg-primary ml-auto h-2 w-2 animate-pulse rounded-full" /> : null}
        </>
      )}
    </SidebarMenuButton>
  </SidebarMenuItem>
);

const DashSidebar = ({ className }: SidebarProps) => {
  const { user } = useSession();
  const { state, toggleSidebar } = useSidebar();
  const t = useTranslations('SidebarMenu');
  const navigationItems = useNavigationItems();

  const isCollapsed = state === 'collapsed';
  const isExpanded = state === 'expanded';

  async function handleLogout() {
    try {
      await logout({ redirectTo: getAbsoluteUrl('/login') });
    } catch (error) {
      console.error('Logout failed:', error);
      // Could add toast notification here
    }
  }

  // Keyboard shortcut handler - useEffectEvent so the handler is stable and reads latest toggleSidebar
  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    // Check for Ctrl+B (or Cmd+B on Mac)
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      event.stopPropagation();

      if (typeof toggleSidebar === 'function') toggleSidebar();
    }
  });

  useEffect(() => {
    // Add event listener with capture to ensure it fires before other handlers
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, []);

  if (!user) {
    return <SidebarSkeleton />;
  }

  return (
    <Sidebar
      side="left"
      variant="sidebar"
      collapsible="icon"
      className={`bg-sidebar/95 supports-backdrop-filter:bg-sidebar/60 border-r backdrop-blur-sm transition-all duration-300 ${
        isCollapsed ? 'min-w-[4rem]' : 'min-w-3xs'
      } ${className}`}
    >
      <SidebarHeader className="border-sidebar-border border-b p-4">
        <div className={`flex items-center ${isCollapsed ? 'flex-col justify-center gap-2' : 'justify-between'}`}>
          <AppLink
            href="/"
            className={`focus:ring-primary -m-1 flex items-center rounded-lg p-1 transition-all duration-200 hover:opacity-80 focus:opacity-80 focus:ring-2 focus:outline-none ${
              isCollapsed ? 'gap-0' : 'gap-3'
            }`}
            aria-label={t('ariaLabels.goToHomepage')}
          >
            <div className="bg-primary/80 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-linear-to-br p-1.5 shadow-sm">
              <div className="relative h-full w-full">
                <Image
                  alt={t('ariaLabels.platformLogo')}
                  src={platformLogoLight}
                  fill
                  sizes="28px"
                  className="object-contain"
                  priority
                />
              </div>
            </div>
            <div
              className={`overflow-hidden transition-all duration-300 ${
                isCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'
              }`}
            >
              <h2 className="text-sidebar-foreground text-lg leading-tight font-semibold">{t('platformName')}</h2>
            </div>
          </AppLink>

          <SidebarTrigger
            className={`hover:bg-sidebar-accent h-8 w-8 rounded-md transition-all duration-200 ${
              isCollapsed ? 'opacity-100' : 'opacity-100'
            }`}
            aria-label={isExpanded ? t('ariaLabels.collapseSidebar') : t('ariaLabels.expandSidebar')}
          />
        </div>
      </SidebarHeader>

      <SidebarContent className="flex-1 overflow-hidden">
        <SidebarGroup>
          <SidebarGroupContent className={isCollapsed ? 'px-2' : ''}>
            <SidebarMenu className={`space-y-1 ${isCollapsed ? 'flex flex-col items-center' : ''}`}>
              {navigationItems.map((item) => (
                <NavItem
                  key={item.href}
                  item={item}
                  isCollapsed={isCollapsed}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="border-sidebar-border border-t p-4">
        <div className={`flex flex-col gap-3 ${isCollapsed ? 'items-center' : ''}`}>
          <Separator className="bg-sidebar-border" />

          {/* User Profile Section */}
          <div className={`flex min-w-0 items-center gap-3 ${isCollapsed ? 'flex-col gap-2' : ''}`}>
            <div className="relative shrink-0">
              <UserAvatar
                username={user.username}
                size="sm"
                variant="outline"
                showProfilePopup
              />
            </div>
            <div
              className={`min-w-0 flex-1 overflow-hidden transition-all duration-300 ${
                isCollapsed ? 'hidden w-0 opacity-0' : 'w-auto opacity-100'
              }`}
            >
              <p className="text-sidebar-foreground truncate text-sm font-medium">@{user.username}</p>
              <p className="text-sidebar-foreground/60 truncate text-xs">{user.email}</p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className={`flex gap-2 ${isCollapsed ? 'w-full flex-col' : ''}`}>
            <SidebarMenuButton
              render={
                <AppLink
                  href="/dash/user-account/settings/general"
                  aria-label={t('ariaLabels.userSettings')}
                />
              }
              tooltip={isCollapsed ? t('tooltips.userSettings', { username: user.username }) : undefined}
              size="sm"
              className={`hover:bg-sidebar-accent/50 flex-1 transition-all duration-200 ${
                isCollapsed ? 'w-full justify-center' : ''
              } flex items-center gap-2 ${isCollapsed ? 'justify-center' : 'justify-center'}`}
            >
              <Settings
                className="h-4 w-4"
                aria-hidden="true"
              />
              <span className={`transition-all duration-200 ${isCollapsed ? 'sr-only' : ''}`}>
                {t('buttons.settings')}
              </span>
            </SidebarMenuButton>

            <SidebarMenuButton
              tooltip={isCollapsed ? t('tooltips.logout') : undefined}
              size="sm"
              onClick={handleLogout}
              className={`text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground flex-1 transition-all duration-200 ${
                isCollapsed ? 'w-full justify-center px-0' : 'gap-2 px-3'
              }`}
            >
              <LogOut
                className="h-4 w-4"
                aria-hidden="true"
              />
              <span className={`transition-all duration-200 ${isCollapsed ? 'sr-only' : ''}`}>
                {t('buttons.logout')}
              </span>
            </SidebarMenuButton>
          </div>

          {/* Keyboard shortcut hint */}
          <div
            className={`flex items-center justify-center transition-all duration-300 ${
              isCollapsed ? 'hidden opacity-0' : 'opacity-60 hover:opacity-100'
            }`}
          >
            <div className="text-sidebar-foreground/50 flex items-center gap-1 text-xs">
              <kbd className="bg-muted text-muted-foreground pointer-events-none inline-flex h-5 items-center gap-1 rounded border px-1.5 font-mono text-[10px] font-medium shadow-sm select-none">
                <span className="font-mono">
                  {typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
                    ? '⌘B'
                    : 'Ctrl+B'}
                </span>
              </kbd>
              <span>{t('keyboardShortcut.toToggle')}</span>
            </div>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
};

export default DashSidebar;
