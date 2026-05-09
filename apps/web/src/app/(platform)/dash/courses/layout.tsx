import { Actions, Resources, Scopes } from '@/types/permissions';
import { requireAnyPermission } from '@/lib/auth/permissions';
import type { ReactNode } from 'react';

export default async function PlatformCoursesLayout({ children }: { children: ReactNode }) {
  await requireAnyPermission([
    { action: Actions.CREATE, resource: Resources.COURSE, scope: Scopes.PLATFORM },
    { action: Actions.UPDATE, resource: Resources.COURSE, scope: Scopes.PLATFORM },
    { action: Actions.UPDATE, resource: Resources.COURSE, scope: Scopes.OWN },
    { action: Actions.MANAGE, resource: Resources.COURSE, scope: Scopes.PLATFORM },
    { action: Actions.MANAGE, resource: Resources.COURSE, scope: Scopes.OWN },
  ]);

  return <>{children}</>;
}
