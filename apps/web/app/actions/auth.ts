'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getServerAPIUrl } from '@services/config/config';
import { applyResponseCookies, buildCookieHeaderFromPairs } from '@/lib/auth/cookie-bridge';
import { getPostAuthRedirect, normalizeReturnTo } from '@/lib/auth/redirect';
import { ACCESS_TOKEN_COOKIE_NAME, REFRESH_TOKEN_COOKIE_NAME } from '@/lib/auth/types';

interface LoginActionInput {
  email: string;
  password: string;
  returnTo?: string | null;
}

interface SignupActionInput {
  email: string;
  firstName: string;
  lastName: string;
  password: string;
}

interface SignupFailurePayload {
  detail?: string | { code?: string };
}

interface AuthActionResult {
  ok: boolean;
  reason?: 'login_failed' | 'login_after_signup_failed' | 'signup_failed' | 'service_unavailable';
  signupCode?: string;
}

type HeaderSource = Pick<Headers, 'get'>;

function buildForwardedHeaders(sourceHeaders: HeaderSource, includeJsonContentType = false): Headers {
  const forwardedHeaders = new Headers();
  const userAgent = sourceHeaders.get('user-agent');
  const forwardedFor = sourceHeaders.get('x-forwarded-for');
  const forwardedHost = sourceHeaders.get('x-forwarded-host');
  const forwardedProto = sourceHeaders.get('x-forwarded-proto');

  if (includeJsonContentType) {
    forwardedHeaders.set('content-type', 'application/json');
  }

  if (userAgent) {
    forwardedHeaders.set('user-agent', userAgent);
  }

  if (forwardedFor) {
    forwardedHeaders.set('x-forwarded-for', forwardedFor);
  }

  if (forwardedHost) {
    forwardedHeaders.set('x-forwarded-host', forwardedHost);
  }

  if (forwardedProto) {
    forwardedHeaders.set('x-forwarded-proto', forwardedProto);
  }

  return forwardedHeaders;
}

async function postAuthJson(path: string, body: unknown, requestHeaders: HeaderSource): Promise<Response> {
  return fetch(`${getServerAPIUrl()}${path}`, {
    method: 'POST',
    headers: buildForwardedHeaders(requestHeaders, true),
    body: JSON.stringify(body),
    cache: 'no-store',
  });
}

function getSignupCode(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null || !('detail' in payload)) {
    return undefined;
  }

  const { detail } = payload;
  if (typeof detail !== 'object' || detail === null || !('code' in detail)) {
    return undefined;
  }

  return typeof detail.code === 'string' ? detail.code : undefined;
}

async function postAuthenticated(path: string): Promise<Response> {
  const [requestHeaders, cookieStore] = await Promise.all([headers(), cookies()]);
  const cookieHeader = buildCookieHeaderFromPairs([
    [ACCESS_TOKEN_COOKIE_NAME, cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value],
    [REFRESH_TOKEN_COOKIE_NAME, cookieStore.get(REFRESH_TOKEN_COOKIE_NAME)?.value],
  ]);

  const forwardedHeaders = buildForwardedHeaders(requestHeaders);
  if (cookieHeader) {
    forwardedHeaders.set('cookie', cookieHeader);
  }

  return fetch(`${getServerAPIUrl()}${path}`, {
    method: 'POST',
    headers: forwardedHeaders,
    cache: 'no-store',
  });
}

export async function loginAction(input: LoginActionInput): Promise<AuthActionResult> {
  const requestHeaders = await headers();
  let response: Response;
  try {
    const formData = new URLSearchParams();
    formData.append('username', input.email.trim().toLowerCase());
    formData.append('password', input.password);

    const forwardedHeaders = buildForwardedHeaders(requestHeaders, false);
    forwardedHeaders.set('content-type', 'application/x-www-form-urlencoded');

    response = await fetch(`${getServerAPIUrl()}auth/login`, {
      method: 'POST',
      headers: forwardedHeaders,
      body: formData,
      cache: 'no-store',
    });
  } catch {
    return { ok: false, reason: 'service_unavailable' };
  }

  if (!response.ok) {
    const reason = response.status === 503 ? 'service_unavailable' : 'login_failed';
    return { ok: false, reason };
  }

  await applyResponseCookies(response.headers);
  revalidatePath('/', 'layout');
  redirect(getPostAuthRedirect(input.returnTo));
}

export async function signupAction(input: SignupActionInput): Promise<AuthActionResult> {
  const requestHeaders = await headers();
  const base = `${input.firstName.toLowerCase()}.${input.lastName.toLowerCase()}`
    .replace(/[^a-z0-9.]/g, '')
    .slice(0, 20);
  const suffix = Math.floor(Math.random() * 10_000)
    .toString()
    .padStart(4, '0');
  const username = `${base}.${suffix}`;
  let signupResponse: Response;
  try {
    signupResponse = await postAuthJson(
      'auth/register',
      {
        email: input.email,
        first_name: input.firstName,
        last_name: input.lastName,
        password: input.password,
        username,
      },
      requestHeaders,
    );
  } catch {
    return { ok: false, reason: 'service_unavailable' };
  }

  if (!signupResponse.ok) {
    const payload = await signupResponse.json().catch(() => null);
    const signupCode = getSignupCode(payload);
    return { ok: false, reason: 'signup_failed', signupCode };
  }

  let loginResponse: Response;
  try {
    const formData = new URLSearchParams();
    formData.append('username', input.email.trim().toLowerCase());
    formData.append('password', input.password);

    const forwardedHeaders = buildForwardedHeaders(requestHeaders, false);
    forwardedHeaders.set('content-type', 'application/x-www-form-urlencoded');

    loginResponse = await fetch(`${getServerAPIUrl()}auth/login`, {
      method: 'POST',
      headers: forwardedHeaders,
      body: formData,
      cache: 'no-store',
    });
  } catch {
    return { ok: false, reason: 'login_after_signup_failed' };
  }

  if (!loginResponse.ok) {
    return { ok: false, reason: 'login_after_signup_failed' };
  }

  await applyResponseCookies(loginResponse.headers);
  revalidatePath('/', 'layout');
  redirect('/redirect_from_auth');
}

export async function logoutAction(redirectTo?: string | null): Promise<void> {
  const response = await postAuthenticated('auth/logout');
  await applyResponseCookies(response.headers);
  revalidatePath('/', 'layout');

  if (redirectTo) {
    redirect(normalizeReturnTo(redirectTo));
  }
}
