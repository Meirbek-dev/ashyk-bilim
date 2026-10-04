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
