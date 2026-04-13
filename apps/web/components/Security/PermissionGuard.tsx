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
  /** Optional content to render while session is loading. Defaults to null (secure by default). */
  loadingFallback?: ReactNode;
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
export function PermissionGuard({
  action,
  resource,
  scope,
  children,
  fallback = null,
  loadingFallback,
}: PermissionGuardProps) {
  const { status, can } = useSession();

  if (status === 'loading') return <>{loadingFallback ?? null}</>;
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
  constructor(props: PermissionErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): PermissionErrorBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error) {
    console.error('PermissionErrorBoundary caught error:', error);
  }

  override render() {
    if (this.state.hasError) {
      return <>{this.props.fallback ?? null}</>;
    }
    return this.props.children;
  }
}

export default PermissionGuard;
