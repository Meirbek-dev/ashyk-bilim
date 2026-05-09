import type { Action, Resource, Scope } from '@/types/permissions';
import type { Session } from './types';
import { AUTH_PERMISSION_WILDCARD } from './types';
import { perm } from '@/types/permissions';
import { requireSession } from './session';
import { redirect } from 'next/navigation';

export function sessionCan(
  session: Pick<Session, 'permissions'> | undefined,
  resource: Resource,
  action: Action,
  scope: Scope,
  permsSet?: Set<string>,
): boolean {
  const perms = permsSet ?? new Set<string>(session?.permissions);
  return perms.has(AUTH_PERMISSION_WILDCARD) || perms.has(perm(resource, action, scope));
}

export async function requirePermission(action: Action, resource: Resource, scope: Scope, redirectTo?: string) {
  const session = await requireSession();
  const perms = new Set<string>(session.permissions);
  if (!sessionCan(session, resource, action, scope, perms)) {
    redirect(redirectTo ?? '/unauthorized');
  }
  return session;
}

export async function requireAnyPermission(
  checks: { action: Action; resource: Resource; scope: Scope }[],
  redirectTo?: string,
) {
  const session = await requireSession();
  const perms = new Set<string>(session.permissions);
  const hasAny = checks.some((c) => sessionCan(session, c.resource, c.action, c.scope, perms));
  if (!hasAny) redirect(redirectTo ?? '/unauthorized');
  return session;
}
