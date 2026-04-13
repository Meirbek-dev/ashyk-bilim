import { Actions, Resources, Scopes } from '@/types/permissions';
import { requireAnyPermission } from '@/lib/auth/permissions';
import type { ReactNode } from 'react';

export default async function PlatformAssignmentsLayout({ children }: { children: ReactNode }) {
  await requireAnyPermission([
    { action: Actions.CREATE, resource: Resources.COURSE, scope: Scopes.PLATFORM },
    { action: Actions.UPDATE, resource: Resources.COURSE, scope: Scopes.PLATFORM },
    { action: Actions.UPDATE, resource: Resources.COURSE, scope: Scopes.OWN },
    { action: Actions.GRADE, resource: Resources.ASSIGNMENT, scope: Scopes.PLATFORM },
    { action: Actions.CREATE, resource: Resources.ASSIGNMENT, scope: Scopes.PLATFORM },
  ]);

  return <>{children}</>;
}
