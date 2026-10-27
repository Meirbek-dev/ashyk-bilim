const FALLBACK = '/home'
const BASE = 'http://internal.invalid'

/**
 * The `redirect` search param accepts only same-origin paths; anything else lands on /home. The check runs on the
 * normalized path (`/./` and `..` collapsed): "/.//evil.example" collapses to the protocol-relative "//evil.example".
 */
export function safeRedirect(value: string | undefined): string {
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) return FALLBACK
  const url = new URL(value, BASE)
  if (url.origin !== BASE || url.pathname.startsWith('//')) return FALLBACK
  return value
}

/**
 * The `redirect` of a sign-in or sign-up link on `href`: a guest comes back to the public page they were reading
 * (B-AUTH-17). From the landing there is nothing to return to (a signed-in "/" is /home): no redirect.
 */
export const returnTo = (href: string): { redirect?: string } => (href === '/' ? {} : { redirect: href })
