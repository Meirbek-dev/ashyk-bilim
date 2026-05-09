import { BarChart2, BookCopy, ClipboardList, School, Settings, ShieldCheck, Users, ChevronRight } from 'lucide-react';
import touEmblemLight from '@/app/_shared/dash/images/tou_emblem_light.webp';
import ServerLink from '@/components/ui/ServerLink';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import Image from 'next/image';

import {
  canSeeAdmin,
  canSeeAnalytics,
  canSeeAssignments,
  canSeeCourses,
  canSeePlatform,
  canSeeUsers,
} from '@/lib/rbac/navigation-policy';
import { requireSession } from '@/lib/auth/session';
import { sessionCan } from '@/lib/auth/permissions';

import platformLogoFull from '../../../public/platform_logo_full.svg';
import platformLogoLightFull from '../../../public/platform_logo_light_full.svg';
import type { Action, Resource, Scope } from '@/types/permissions';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default async function PlatformDashHomePage() {
  const t = await getTranslations('DashPage.Card');
  const session = await requireSession();
  const permsSet = new Set<string>(session.permissions);
  const can = (resource: Resource, action: Action, scope: Scope): boolean =>
    sessionCan(session, resource, action, scope, permsSet);

  const hasCoursesAccess = canSeeCourses(can);
  const hasAssignmentsAccess = canSeeAssignments(can);
  const hasAnalyticsAccess = canSeeAnalytics(can);
  const hasPlatformAccess = canSeePlatform(can);
  const hasUsersAccess = canSeeUsers(can);
  const hasAdminAccess = canSeeAdmin(can);

  const cards = [
    {
      visible: hasCoursesAccess,
      href: '/dash/courses',
      icon: <BookCopy size={22} />,
      title: t('Courses.title'),
      description: t('Courses.description'),
    },
    {
      visible: hasAssignmentsAccess,
      href: '/dash/courses',
      icon: <ClipboardList size={22} />,
      title: t('Assignments.title'),
      description: t('Assignments.description'),
    },
    {
      visible: hasAnalyticsAccess,
      href: '/dash/analytics',
      icon: <BarChart2 size={22} />,
      title: t('Analytics.title'),
      description: t('Analytics.description'),
    },
    {
      visible: hasPlatformAccess,
      href: '/dash/platform/settings/landing',
      icon: <School size={22} />,
      title: t('Platform.title'),
      description: t('Platform.description'),
    },
    {
      visible: hasUsersAccess,
      href: '/dash/users/settings/users',
      icon: <Users size={22} />,
      title: t('Users.title'),
      description: t('Users.description'),
    },
    {
      visible: hasAdminAccess,
      href: '/dash/admin',
      icon: <ShieldCheck size={22} />,
      title: t('Admin.title'),
      description: t('Admin.description'),
      badge: t('Admin.badge'),
    },
  ].filter((card) => card.visible);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      {/* Logo */}
      <div className="mb-12">
        <Image
          alt={t('platformLogo')}
          width={210}
          src={platformLogoFull}
          className="theme-logo-dark w-40 sm:w-[210px]"
          style={{ height: 'auto' }}
          loading="eager"
        />
        <Image
          alt={t('platformLogo')}
          width={210}
          src={platformLogoLightFull}
          className="theme-logo-light w-40 sm:w-[210px]"
          style={{ height: 'auto' }}
          loading="eager"
        />
      </div>

      {/* Nav Cards Grid */}
      {cards.length > 0 ? (
        <div className="grid w-full max-w-4xl grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card) => (
            <DashboardCard
              key={card.title}
              href={card.href}
              icon={card.icon}
              title={card.title}
              description={card.description}
              badge={card.badge}
            />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">{t('noAccess')}</p>
      )}

      {/* Footer */}
      <div className="mt-6 flex flex-col gap-6 sm:mt-10 sm:gap-10">
        <div className="bg-muted/40 dark:bg-muted/80 mx-auto h-1 w-[100px] rounded-full" />
        <div className="flex items-center justify-center">
          <ServerLink
            href="https://tou.edu.kz/ru/"
            target="_blank"
            className="bg-primary mt-4 flex cursor-pointer items-center gap-2 rounded-lg px-7 py-3 shadow-lg transition-all ease-linear hover:scale-105 sm:mt-[40px]"
          >
            <Image
              width={26}
              src={touEmblemLight}
              alt={t('touUniversity')}
            />
            <div className="text-primary-foreground text-sm font-bold">{t('touUniversity')}</div>
          </ServerLink>
        </div>
        <div className="bg-muted/40 dark:bg-muted/80 mx-auto mt-4 h-1 w-28 rounded-full sm:mt-[40px]" />

        <ServerLink
          href="/dash/user-account/settings/general"
          className="bg-background mx-auto flex max-w-md cursor-pointer items-center rounded-lg p-4 shadow-lg transition-all ease-linear hover:scale-105"
        >
          <div className="mx-auto flex flex-col items-center gap-2 text-center sm:flex-row sm:gap-3 sm:text-left">
            <Settings
              className="text-muted-foreground"
              size={20}
            />
            <div>
              <div className="text-muted-foreground font-bold">{t('AccountSettings.title')}</div>
              <p className="text-muted-foreground text-sm">{t('AccountSettings.description')}</p>
            </div>
          </div>
        </ServerLink>
      </div>
    </div>
  );
}

const DashboardCard = ({
  href,
  icon,
  title,
  description,
  badge,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
  badge?: string;
}) => {
  return (
    <ServerLink
      href={href}
      className="group block"
    >
      <Card className="hover:bg-accent hover:text-accent-foreground h-full transition-colors duration-150">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between">
            <div className="bg-muted text-muted-foreground group-hover:bg-background rounded-md p-2 transition-colors duration-150">
              {icon}
            </div>
            <div className="flex items-center gap-2">
              {badge && (
                <Badge
                  variant="secondary"
                  className="text-xs"
                >
                  {badge}
                </Badge>
              )}
              <ChevronRight
                size={16}
                className="text-muted-foreground translate-x-0 opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-100"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <CardTitle className="mb-1 text-base">{title}</CardTitle>
          <CardDescription className="text-sm leading-relaxed">{description}</CardDescription>
        </CardContent>
      </Card>
    </ServerLink>
  );
};
