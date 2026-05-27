import { Actions, Resources, Scopes } from '@/types/permissions';
import { requireAnyPermission } from '@/lib/auth/permissions';
import type { ReactNode } from 'react';

export default async function PlatformSettingsLayout({ children }: { children: ReactNode }) {
  await requireAnyPermission(
    [
      { action: Actions.READ, resource: Resources.APP, scope: Scopes.OWN },
      { action: Actions.UPDATE, resource: Resources.APP, scope: Scopes.OWN },
      { action: Actions.READ, resource: Resources.APP, scope: Scopes.APP },
      { action: Actions.UPDATE, resource: Resources.APP, scope: Scopes.APP },
      { action: Actions.MANAGE, resource: Resources.APP, scope: Scopes.APP },
    ],
    '/dash',
  );

  return <>{children}</>;
}
