import { Actions, Resources, Scopes } from '@/types/permissions';
import { requireAnyPermission } from '@/lib/auth/permissions';
import type { ReactNode } from 'react';

export default async function AppUsersLayout({ children }: { children: ReactNode }) {
  await requireAnyPermission([
    { action: Actions.UPDATE, resource: Resources.USER, scope: Scopes.APP },
    { action: Actions.READ, resource: Resources.USER, scope: Scopes.APP },
    { action: Actions.MANAGE, resource: Resources.USERGROUP, scope: Scopes.APP },
  ]);

  return <>{children}</>;
}
