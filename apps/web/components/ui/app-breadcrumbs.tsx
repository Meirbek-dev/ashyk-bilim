'use client';

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Backpack, Book, School, User, Users } from 'lucide-react';
import AppLink from '@/components/ui/AppLink';
import { getAbsoluteUrl } from '@services/config/config';
import { useTranslations } from 'next-intl';

// ── DashBreadcrumbs ──────────────────────────────────────────────────────────
// Replaces the old BreadCrumbs component used throughout the dashboard.

export type DashBreadcrumbType = 'courses' | 'user' | 'users' | 'platform' | 'platformusers' | 'assignments';

interface DashBreadcrumbsProps {
  type: DashBreadcrumbType;
  last_breadcrumb?: string;
}

const DASH_BREADCRUMB_CONFIGS: Record<
  DashBreadcrumbType,
  { href: string; icon: React.ComponentType<{ className?: string; size?: number }>; titleKey: string }
> = {
  courses: { href: '/dash/courses', icon: Book, titleKey: 'Courses.title' },
  assignments: { href: '/dash/courses', icon: Backpack, titleKey: 'Assignments.title' },
  user: { href: '/dash/user-account/settings/general', icon: User, titleKey: 'UserAccountSettings.title' },
  users: { href: '/dash/users/settings/users', icon: Users, titleKey: 'Card.Users.title' },
  platformusers: { href: '/dash/users/settings/users', icon: Users, titleKey: 'Card.Users.title' },
  platform: { href: '/dash/platform/settings/landing', icon: School, titleKey: 'Card.Platform.title' },
};

export function DashBreadcrumbs({ type, last_breadcrumb }: DashBreadcrumbsProps) {
  const t = useTranslations('DashPage');
  const config = DASH_BREADCRUMB_CONFIGS[type];
  if (!config) return null;

  const Icon = config.icon;

  return (
    <div>
      <div className="h-7" />
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              render={<AppLink href={config.href} />}
              className="flex items-center space-x-2"
            >
              <Icon
                className="text-muted-foreground"
                size={14}
              />
              <span>{t(config.titleKey as any)}</span>
            </BreadcrumbLink>
          </BreadcrumbItem>
          {last_breadcrumb ? (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage className="first-letter:uppercase">{last_breadcrumb}</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          ) : null}
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}

// ── CourseBreadcrumbs ────────────────────────────────────────────────────────
// Replaces ActivityBreadcrumbs used on the student activity page.

interface CourseBreadcrumbsProps {
  course: { course_uuid: string; name: string };
  activity: { name: string };
}

export function CourseBreadcrumbs({ course, activity }: CourseBreadcrumbsProps) {
  const cleanCourseUuid = course.course_uuid?.replace('course_', '');
  const t = useTranslations('General');

  return (
    <div className="mb-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink
              render={<AppLink href={`${getAbsoluteUrl('')}/courses`} />}
              className="flex items-center space-x-2"
            >
              <Book
                className="text-gray"
                size={14}
              />
              <span>{t('courses')}</span>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink render={<AppLink href={`${getAbsoluteUrl('')}/course/${cleanCourseUuid}`} />}>
              {course.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage className="first-letter:uppercase">{activity.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
    </div>
  );
}
