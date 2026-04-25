import type { components } from '@/lib/api/generated';

type UserRead = components['schemas']['UserRead'];

/** Subset of UserRead fields the web app actually consumes in session state. */
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

/** Frontend session shape used by the app after mapping backend field names. */
export interface Session extends Omit<UserSessionResponse, 'user'> {
  user: SessionUser;
  expiresAt: number;
  sessionVersion: number | null;
}

// ── Cookie / token constants ──────────────────────────────────────────────────

export const ACCESS_TOKEN_COOKIE_NAME = 'access_token_cookie';
export const REFRESH_TOKEN_COOKIE_NAME = 'refresh_token_cookie';

export const AUTH_COOKIE_NAMES = [ACCESS_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_NAME] as const;

export const AUTH_PERMISSION_WILDCARD = '*';
