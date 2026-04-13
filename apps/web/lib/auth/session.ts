import 'server-only';
import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createRemoteJWKSet, errors as joseErrors, jwtVerify } from 'jose';
import { getServerAPIUrl } from '@services/config/config';
import { ACCESS_TOKEN_COOKIE_NAME } from './types';
import type { AccessTokenPayload, Session } from './types';

// ── JWKS (cached in-process by jose, re-fetched only on key rotation) ─────────

/**
 * The JWKS URL points to the FastAPI backend's public-key endpoint.
 * jose caches the key in memory; re-fetches only when the KID is unknown
 * (i.e. key rotation).  Network overhead is effectively zero after the first
 * request per server process.
 */
const JWKS = createRemoteJWKSet(new URL('auth/.well-known/jwks.json', getServerAPIUrl()));

// ── Session construction ───────────────────────────────────────────────────────

/**
 * Build a fully-typed Session from a verified AccessTokenPayload.
 *
 * The JWT carries only a slim ``u`` claim (id, uuid, name, email, avatar).
 * Heavy fields (bio, details, profile, theme, role objects) are served via
 * ``GET /auth/me`` on demand.  The frontend calls this once on app load and
 * caches the result via ``useFullProfile()``.
 *
 * Fields sourced from JWT:
 *   permissions      → payload.perms  (full RBAC set, O(1) lookups)
 *   permissions_timestamp → payload.rvs
 *   expires_at       → payload.exp   (seconds)
 *   session_version  → payload.iat
 *   expiresAt        → payload.exp * 1000  (ms)
 *   sessionVersion   → payload.iat
 *   user             → payload.u  (slim: id, name, email, avatar)
 *   roles            → [] (full role objects served via GET /auth/me)
 */
function sessionFromPayload(payload: AccessTokenPayload): Session {
  const nameParts = payload.u.name.split(' ');
  const firstName = nameParts[0] ?? '';
  const lastName = nameParts.slice(1).join(' ');

  return {
    user: {
      id: payload.u.id,
      user_uuid: payload.u.uuid,
      username: '',
      email: payload.u.email,
      first_name: firstName,
      last_name: lastName,
      middle_name: null,
      avatar_image: payload.u.avatar || null,
      bio: null,
      details: null,
      profile: null,
      theme: null,
    },
    roles: [],
    permissions: payload.perms,
    permissions_timestamp: payload.rvs,
    expires_at: payload.exp,
    session_version: payload.iat,
    expiresAt: payload.exp * 1000,
    sessionVersion: payload.iat,
  };
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Verify the access token locally using the backend's Ed25519 public key and
 * return a typed Session — with NO backend HTTP call.
 *
 * The result is deduplicated within a single RSC render tree via React.cache().
 * A new verification is performed for every incoming request.
 *
 * Returns null when:
 *   - No access token cookie is present.
 *   - The token has expired (JWTExpired).
 *   - The token signature is invalid.
 *   - The token is missing required claims (u, perms, role_data).
 *
 * Note: JTI blocklist checks (for logged-out tokens) happen server-side in
 * FastAPI on every authenticated API call.  Local verification intentionally
 * skips the blocklist to avoid a Redis round-trip on every page render.
 * The maximum window for a blocklisted-but-locally-valid token is the access
 * token TTL.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const cookieStore = await cookies();
  const token = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify<AccessTokenPayload>(token, JWKS, {
      issuer: 'ashyq-bilim-auth',
      audience: 'ashyq-bilim-api',
      algorithms: ['EdDSA'],
    });

    // Guard: tokens issued before the new claim fields were added will be
    // missing `u` or `perms`.  Treat them as expired so the user refreshes
    // to a full token.
    if (!payload.u || !payload.perms) {
      return null;
    }

    return sessionFromPayload(payload);
  } catch (error) {
    // JWTExpired is the normal case when the access token has timed out.
    // The proxy.ts / refresh route handles getting a new token.
    if (error instanceof joseErrors.JWTExpired) {
      return null;
    }
    // Other errors (invalid signature, malformed token, JWKS fetch failure)
    // are unexpected — log and treat as unauthenticated.
    const message = error instanceof Error ? error.message : String(error);
    console.warn('[getSession] JWT verification failed:', message);
    return null;
  }
});

/**
 * Require an authenticated session or redirect to /login.
 *
 * The returnTo path comes from the x-pathname header injected by proxy.ts,
 * so the user lands back at their intended destination after signing in.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) {
    const headersList = await headers();
    const returnTo = headersList.get('x-pathname') ?? '/';
    redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
  }
  return session;
}
