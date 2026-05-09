// ── Route classification ──────────────────────────────────────────────────────

const AUTH_ROUTE_PREFIXES = ['/login', '/signup', '/forgot', '/reset'] as const;

const PROTECTED_ROUTE_PREFIXES = [
  '/dash',
  '/profile',
  '/settings',
  '/admin',
  '/analytics',
  '/editor',
  '/certificates',
] as const;

export function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// ── Redirect helpers ──────────────────────────────────────────────────────────

export function getCurrentReturnTo(): string {
  if (typeof globalThis.window === 'undefined') return '/';
  const { pathname, search } = globalThis.location;
  return `${pathname}${search}` || '/';
}

export function normalizeReturnTo(returnTo: string | null | undefined): string {
  if (!returnTo) return '/';

  try {
    const origin = typeof globalThis.window === 'undefined' ? 'http://localhost' : globalThis.location.origin;
    const parsed = new URL(returnTo, origin);
    const normalizedPath = `${parsed.pathname}${parsed.search}` || '/';

    if (parsed.origin !== origin || isAuthRoute(parsed.pathname)) {
      return '/';
    }

    return normalizedPath;
  } catch {
    if (!returnTo.startsWith('/') || returnTo.startsWith('//')) {
      return '/';
    }

    const [pathname] = returnTo.split('?');
    return isAuthRoute(pathname || '/') ? '/' : returnTo;
  }
}

export function getPostAuthRedirect(returnTo: string | null | undefined): string {
  const normalized = normalizeReturnTo(returnTo);
  return normalized === '/' ? '/redirect_from_auth' : normalized;
}

export function buildLoginRedirect(returnTo?: string | null): string {
  const resolved = normalizeReturnTo(returnTo ?? getCurrentReturnTo());
  return `/login?returnTo=${encodeURIComponent(resolved)}`;
}
