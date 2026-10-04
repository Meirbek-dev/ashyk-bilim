const FALLBACK = '/home'
const BASE = 'http://internal.invalid'

/**
 * The `redirect` search param accepts only same-origin paths; anything else lands on /home. The value is returned
 * normalized (`/./` and `..` collapsed), so what the router or the API's callback sees is what was checked here:
 * "/.//evil.example" would collapse to the protocol-relative "//evil.example".
 */
export function safeRedirect(value: string | undefined): string {
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) return FALLBACK
  const url = new URL(value, BASE)
  if (url.origin !== BASE || url.pathname.startsWith('//')) return FALLBACK
  return `${url.pathname}${url.search}${url.hash}`
}
