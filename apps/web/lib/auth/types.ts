import type { components } from '@/lib/api/generated';

type UserRead = components['schemas']['UserRead'];

/** Subset of UserRead fields the session UI actually consumes. */
export type SessionUser = Pick<
  UserRead,
  | 'id'
  | 'user_uuid'
  | 'username'
  | 'email'
  | 'first_name'
  | 'last_name'
  | 'middle_name'
  | 'avatar_image'
  | 'bio'
  | 'details'
  | 'profile'
  | 'theme'
>;

/** Full UserSession schema from the OpenAPI-generated types. */
export type UserSessionResponse = components['schemas']['UserSession'];

/** Frontend session shape — fully constructable from JWT claims alone. */
export interface Session extends Omit<UserSessionResponse, 'user'> {
  user: SessionUser;
  expiresAt: number;
  sessionVersion: number | null;
}

// ── Cookie / token constants ──────────────────────────────────────────────────

export const ACCESS_TOKEN_COOKIE_NAME = 'access_token_cookie';
export const REFRESH_TOKEN_COOKIE_NAME = 'refresh_token_cookie';

export const AUTH_COOKIE_NAMES = [ACCESS_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_NAME] as const;

export const AUTH_REFRESH_BRIDGE_PATH = '/api/auth/refresh';
export const AUTH_PERMISSION_WILDCARD = '*';

// ── JWT claim types ───────────────────────────────────────────────────────────

/**
 * Slim user display claims embedded in the JWT ``u`` claim.
 *
 * Contains only the fields needed to render the session chrome (nav bar, avatar)
 * without a backend round-trip.  Full profile data (bio, details, theme, role
 * objects) is served via ``GET /auth/me`` on demand.
 */
export interface RawUserClaims {
  id: number;
  uuid: string;
  name: string;
  email: string;
  avatar: string;
}

/**
 * Typed shape of the EdDSA access-token payload.
 *
 * Standard claims (sub, jti, iss, aud, iat, exp) are complemented by:
 *   rvs        — roles-version timestamp; compared against ``roles_updated:{uuid}``
 *                in Redis to detect stale role embeddings.
 *   roles      — role slugs (for display / logging).
 *   perms      — fully expanded permission strings ("resource:action:scope")
 *                or `*` for a token-level full-access sentinel.
 *   u          — slim user display claims (id, name, email, avatar).
 *
 * Full role objects and extended user profile fields are no longer embedded in
 * the JWT — they are served via ``GET /auth/me`` to keep the token ~800 bytes.
 */
export interface AccessTokenPayload {
  /** User UUID — maps to Session.user.user_uuid. */
  sub: string;
  jti: string;
  /** Session ID — used by the backend for server-side session validation. */
  sid: string;
  iss: string;
  aud: string;
  /** Issued-at unix timestamp — maps to Session.sessionVersion / session_version. */
  iat: number;
  /** Expiry unix timestamp — maps to Session.expiresAt (×1000) / expires_at. */
  exp: number;
  /** Roles-version: unix timestamp when roles were embedded.
   *  Backend compares this to `roles_updated:{sub}` in Redis.
   *  Frontend maps this to Session.permissions_timestamp. */
  rvs: number;
  /** Role slugs — embedded for display and logging. */
  roles: string[];
  /** Fully expanded permission strings ("resource:action:scope") or `*`.
   *  Frontend accepts the wildcard sentinel as full access; otherwise it does
   *  exact Set.has() lookups. */
  perms: string[];
  type: 'access';
  /** Slim user display claims — id, name, email, avatar only. */
  u: RawUserClaims;
}
