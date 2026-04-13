import { Actions, Resources, Scopes } from '@/types/permissions';
import { requireAnyPermission } from '@/lib/auth/permissions';
import type { ReactNode } from 'react';

export default async function PlatformAdminLayout({ children }: { children: ReactNode }) {
  await requireAnyPermission([
    { action: Actions.MANAGE, resource: Resources.PLATFORM, scope: Scopes.OWN },
    { action: Actions.UPDATE, resource: Resources.PLATFORM, scope: Scopes.OWN },
    { action: Actions.MANAGE, resource: Resources.PLATFORM, scope: Scopes.PLATFORM },
    { action: Actions.UPDATE, resource: Resources.PLATFORM, scope: Scopes.PLATFORM },
    { action: Actions.MANAGE, resource: Resources.ROLE, scope: Scopes.PLATFORM },
    { action: Actions.UPDATE, resource: Resources.ROLE, scope: Scopes.PLATFORM },
    { action: Actions.READ, resource: Resources.ROLE, scope: Scopes.PLATFORM },
  ]);

  return <>{children}</>;
}
