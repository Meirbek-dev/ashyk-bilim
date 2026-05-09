import { Actions, Resources, Scopes } from '@/types/permissions';
import { requireAnyPermission } from '@/lib/auth/permissions';
import type { ReactNode } from 'react';

export default async function PlatformUsersLayout({ children }: { children: ReactNode }) {
  await requireAnyPermission([
    { action: Actions.UPDATE, resource: Resources.USER, scope: Scopes.PLATFORM },
    { action: Actions.READ, resource: Resources.USER, scope: Scopes.PLATFORM },
    { action: Actions.MANAGE, resource: Resources.USERGROUP, scope: Scopes.PLATFORM },
  ]);

  return <>{children}</>;
}
