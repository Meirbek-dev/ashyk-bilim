'use client';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu';
import { ChevronDown, Crown, LogOut, Shield, User as UserIcon, Users, Star } from 'lucide-react'; // Added Star
import { Tooltip, TooltipContent, TooltipTrigger } from '@components/ui/tooltip';
import { useNavigationPermissions } from '@/hooks/useNavigationPermissions';
import { useSession } from '@/hooks/useSession';
import { logout } from '@services/auth/auth';
import { getAbsoluteUrl } from '@services/config/config';
import UserAvatar from '@components/Objects/UserAvatar';
import { RoleSlugs } from '@/types/permissions';
import { Button } from '@components/ui/button';
import { Badge } from '@components/ui/badge';
import type { Session } from '@/lib/auth/types';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import Link from '@components/ui/AppLink';
import type { ReactNode } from 'react';

interface RoleInfo {
  slug: string; // Added slug to help with conditional rendering
  name: string;
  icon: ReactNode;
  bgColor: string;
  textColor: string;
  description: string;
}

interface CustomRoleInfo {
  name: string;
  description?: string;
}

type SessionRole = Session['roles'][number];

export const HeaderProfileBox = () => {
  const { isAuthenticated, session, user } = useSession();
  const { canAccessDashboard } = useNavigationPermissions();
  const t = useTranslations('Header');
  const [isLoggingOut, startLogoutTransition] = useTransition();

  const userRoles = session?.roles ?? [];

  let userRoleInfo: RoleInfo | null = null;
  if (userRoles && userRoles.length > 0) {
    const sortedRoles = [...userRoles].toSorted((a: SessionRole, b: SessionRole) => {
      return (b.role?.priority ?? 0) - (a.role?.priority ?? 0);
    });

    const highestRole = sortedRoles[0];

    if (highestRole) {
      const roleSlug = highestRole.role?.slug || '';
      const roleConfigs: Record<string, RoleInfo> = {
        [RoleSlugs.ADMIN]: {
          slug: RoleSlugs.ADMIN,
          name: t('profile.roles.admin.name'),
          icon: <Crown size={12} />,
          bgColor: 'bg-purple-600',
          textColor: 'text-white',
          description: t('profile.roles.admin.description'),
        },
        [RoleSlugs.MAINTAINER]: {
          slug: RoleSlugs.MAINTAINER,
          name: t('profile.roles.maintainer.name'),
          icon: <Shield size={12} />,
          bgColor: 'bg-blue-600',
          textColor: 'text-white',
          description: t('profile.roles.maintainer.description'),
        },
        [RoleSlugs.INSTRUCTOR]: {
          slug: RoleSlugs.INSTRUCTOR,
          name: t('profile.roles.instructor.name'),
          icon: <Users size={12} />,
          bgColor: 'bg-green-600',
          textColor: 'text-white',
          description: t('profile.roles.instructor.description'),
        },
        [RoleSlugs.USER]: {
          slug: RoleSlugs.USER,
          name: t('profile.roles.user.name'),
          icon: <Star size={12} />,
          bgColor: 'bg-gray-500',
          textColor: 'text-white',
          description: t('profile.roles.user.description'),
        },
      };

      userRoleInfo = roleConfigs[roleSlug] || roleConfigs[RoleSlugs.USER] || null;
    }
  }

  // Logic to determine if we should show the badge
  // We hide it if it's the standard USER role to reduce clutter
  const shouldShowBadge = userRoleInfo !== null && userRoleInfo.slug !== RoleSlugs.USER;

  const customRoles: CustomRoleInfo[] =
    userRoles.length > 0
      ? userRoles
          .filter((role: SessionRole) => !role.role?.is_system)
          .map((role: SessionRole) => ({
            name: role.role.name || t('profile.customRole'),
            description: role.role.description ?? undefined,
          }))
      : [];

  const handleLogout = () => {
    startLogoutTransition(() => {
      void logout();
    });
  };

  return (
    <div className="flex items-center">
      {!isAuthenticated && (
        <div className="text-foreground flex grow rounded-lg p-1.5 px-2 text-sm font-bold">
          <ul className="flex items-center space-x-3">
            <li>
              <Link
                prefetch={false}
                href={getAbsoluteUrl('/login')}
              >
                <Button
                  variant="ghost"
                  size="sm"
                >
                  {t('login')}
                </Button>
              </Link>
            </li>
            <li>
              <Link
                prefetch={false}
                href={getAbsoluteUrl('/signup')}
              >
                <Button size="sm">{t('signUp')}</Button>
              </Link>
            </li>
          </ul>
        </div>
      )}
      {isAuthenticated && (
        <div className="flex items-center">
          <div className="flex items-center space-x-3">
            <DropdownMenu>
              <DropdownMenuTrigger
                nativeButton
                render={
                  <Button
                    variant="ghost"
                    className="flex h-auto items-center space-x-1 p-2"
                  />
                }
              >
                <UserAvatar size="sm" />
                <div className="flex flex-col space-y-0 text-start">
                  <div className="flex items-center space-x-2">
                    <p className="text-foreground text-sm font-semibold capitalize">{user?.username}</p>
                    {/* Updated condition here */}
                    {shouldShowBadge && userRoleInfo && (
                      <Tooltip>
                        <TooltipTrigger
                          render={
                            <Badge
                              variant="secondary"
                              className={`text-[10px] ${userRoleInfo.bgColor} ${userRoleInfo.textColor} flex w-fit items-center gap-1 rounded-sm px-1.5 py-0 font-bold tracking-wider uppercase`}
                            >
                              {userRoleInfo.icon}
                              {userRoleInfo.name}
                            </Badge>
                          }
                        />
                        <TooltipContent
                          side="bottom"
                          sideOffset={15}
                          className="max-w-56"
                        >
                          {userRoleInfo.description}
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {/* Custom roles */}
                    {customRoles.map((customRole, index) => (
                      <Tooltip key={index}>
                        <TooltipTrigger
                          render={
                            <Badge
                              variant="secondary"
                              className="flex w-fit items-center gap-0.5 bg-slate-500 px-1 py-0.5 text-[8px] font-medium text-white"
                            >
                              <Shield size={10} />
                              {customRole.name}
                            </Badge>
                          }
                        />
                        <TooltipContent
                          side="bottom"
                          sideOffset={15}
                          className="max-w-56"
                        >
                          {customRole.description || `Custom role: ${customRole.name}`}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                  <p className="text-muted-foreground text-xs">{user?.email}</p>
                </div>
                <ChevronDown
                  size={16}
                  className="text-muted-foreground"
                />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-56"
                align="end"
              >
                <div className="px-2 py-1.5">
                  <div className="flex items-center space-x-2">
                    <UserAvatar size="sm" />
                    <div>
                      <p className="text-sm font-medium capitalize">{user?.username}</p>
                      <p className="text-muted-foreground text-xs">{user?.email}</p>
                    </div>
                  </div>
                </div>
                <DropdownMenuSeparator />
                {canAccessDashboard && (
                  <DropdownMenuItem
                    nativeButton={false}
                    render={
                      <Link
                        prefetch={false}
                        href="/dash"
                      />
                    }
                    className="flex items-center space-x-2"
                  >
                    <Shield size={16} />
                    <span>{t('profile.dashboard')}</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  nativeButton={false}
                  render={
                    <Link
                      prefetch={false}
                      href="/dash/user-account/settings/general"
                    />
                  }
                  className="flex items-center space-x-2"
                >
                  <UserIcon size={16} />
                  <span>{t('profile.userSettings')}</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onClick={handleLogout}
                  disabled={isLoggingOut}
                  className="flex space-x-2"
                >
                  <LogOut size={16} />
                  <span>{t('profile.signOut')}</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      )}
    </div>
  );
};
