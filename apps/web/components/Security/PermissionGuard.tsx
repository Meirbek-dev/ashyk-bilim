'use client';

import type { Action, Resource, Scope } from '@/types/permissions';
import { useSession } from '@/hooks/useSession';
import type { ReactNode } from 'react';
import { Component } from 'react';

interface PermissionGuardProps {
  /** Action to check permission for. */
  action: Action;
  /** Resource to check permission for. */
  resource: Resource;
  /** Permission scope (required - no silent default). */
  scope: Scope;
  /** Content to render if permission is granted. */
  children: ReactNode;
  /** Optional fallback content if permission is denied. */
  fallback?: ReactNode;
}

/**
 * Guard component that conditionally renders children based on permissions.
 *
 * @example
 * ```tsx
 * <PermissionGuard action={Actions.CREATE} resource={Resources.COURSE} scope={Scopes.PLATFORM}>
 *   <CreateButton />
 * </PermissionGuard>
 * ```
 */
export function PermissionGuard({ action, resource, scope, children, fallback = null }: PermissionGuardProps) {
  const { can } = useSession();

  if (!can(resource, action, scope)) return <>{fallback}</>;
  return <>{children}</>;
}

/**
 * Error boundary for permission-dependent UI.
 * Catches render errors from children and shows a fallback
 * instead of crashing the entire page.
 */
interface PermissionErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface PermissionErrorBoundaryState {
  hasError: boolean;
}

export class PermissionErrorBoundary extends Component<PermissionErrorBoundaryProps, PermissionErrorBoundaryState> {
  public constructor(props: PermissionErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  public static getDerivedStateFromError(): PermissionErrorBoundaryState {
    return { hasError: true };
  }

  public override componentDidCatch(error: Error) {
    console.error('PermissionErrorBoundary caught error:', error);
  }

  public override render() {
    if (this.state.hasError) {
      return <>{this.props.fallback ?? null}</>;
    }
    return this.props.children;
  }
}

export default PermissionGuard;
