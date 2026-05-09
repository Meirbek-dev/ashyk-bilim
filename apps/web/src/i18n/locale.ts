/*
  getUserLocale

  Lightweight helper that returns the user's locale preference.
  IMPORTANT: this implementation intentionally avoids calling
  `cookies()` or other dynamic server APIs directly so it can be
  executed during static generation. Instead, callers should pass a
  cookie store (for example the `cookies` object received in
  `getRequestConfig`) when available.

  Behavior:
  - If `cookieStore` is provided and has a `get` method, read
    `NEXT_LOCALE` from it and return that value when present.
  - Otherwise return `defaultLocale`.

  This change prevents accidental dynamic server usage during
  static page generation.
*/

import { defaultLocale } from '@/i18n/config';
import type { Locale } from '@/i18n/config';

const COOKIE_NAME = 'NEXT_LOCALE';

export async function getUserLocale(cookieStore?: { get: (name: string) => { value?: string } | undefined }) {
  try {
    if (cookieStore && typeof cookieStore.get === 'function') {
      const c = cookieStore.get(COOKIE_NAME);
      if (c?.value) return c.value as Locale;
    }
  } catch {
    // Don't throw - callers should fall back to default locale
    // Logging omitted to avoid noisy output during static builds
  }

  return defaultLocale;
}

export async function setUserLocale(locale: Locale) {
  // Client-side helper to persist locale preference in a cookie.
  // This function is safe to call from client components. Server
  // code should use the request/response cookie store instead.
  if (typeof document === 'undefined') {
    // Not running in browser - caller should handle server-side
    // persistence separately.
    throw new Error('setUserLocale can only be called in the browser');
  }

  try {
    const maxAge = 30 * 24 * 60 * 60; // 30 days
    const value = encodeURIComponent(locale);
    // Use a reasonably safe cookie; avoid Secure flag here because
    // this function can be used in development over http.
    document.cookie = `${COOKIE_NAME}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
  } catch (error) {
    // Log but don't throw further - callers may not expect failures
    // from cookie writes in constrained environments.
    console.error('[setUserLocale] Failed to set cookie:', error);
  }
}
