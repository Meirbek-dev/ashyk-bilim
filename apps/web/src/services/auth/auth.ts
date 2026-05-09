import { getAPIUrl } from '@services/config/config';
import { logoutAction } from '@/app/actions/auth';
import { apiFetch } from '@/lib/api-client';
import { broadcastLogout } from '@/components/providers/session-provider';
import type { components } from '@/lib/api/generated';

type AuthUser = components['schemas']['UserRead'];

interface LogoutOptions {
  redirectTo?: string;
}

export async function getGoogleAuthorizeUrl(frontendCallback: string): Promise<string> {
  const url = new URL(`${getAPIUrl()}auth/google/authorize`);
  url.searchParams.set('callback', frontendCallback);
  return url.toString();
}

export async function logout(options?: LogoutOptions): Promise<void> {
  broadcastLogout();
  await logoutAction(options?.redirectTo ?? '/login');
}

export async function sendResetLink(email: string): Promise<Response> {
  return apiFetch('auth/forgot-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<Response> {
  return apiFetch('auth/reset-password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, new_password: newPassword }),
  });
}

export type { AuthUser };
