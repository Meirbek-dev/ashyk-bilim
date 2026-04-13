'use client';

import { Actions, PermissionGuard, Resources, Scopes } from '@/components/Security';
import { buildCourseCreationPath } from '@/lib/course-management';
import { Button } from '@/components/ui/button';
import AppLink from '@/components/ui/AppLink';
import { useTranslations } from 'next-intl';

export default function CreateCourseTrigger() {
  const t = useTranslations('Components.Button');

  return (
    <PermissionGuard
      action={Actions.CREATE}
      resource={Resources.COURSE}
      scope={Scopes.PLATFORM}
      fallback={null}
    >
      <Button
        nativeButton={false}
        render={<AppLink href={buildCourseCreationPath()} />}
        className="my-auto gap-2 rounded-lg px-4 py-2 font-semibold"
      >
        <span>{t('newCourse')}</span>
        <span className="rounded-full border border-current/15 px-1.5 text-xs leading-5 font-medium">+</span>
      </Button>
    </PermissionGuard>
  );
}
