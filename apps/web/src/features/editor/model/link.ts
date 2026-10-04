const LINK_PROTOCOLS = new Set(['https:', 'http:', 'mailto:'])

/**
 * A link target as the server stores it (REVIEW-1 C1): an absolute http(s) or mailto URL, or an in-page
 * `#anchor`. A bare `example.com/page` becomes `https://example.com/page`; relative paths, other schemes and
 * text that is not an address are undefined.
 */
export function linkHref(value: string): string | undefined {
  const text = value.trim()
  if (text.startsWith('#')) return text.length > 1 ? text : undefined
  if (!text || /\s/.test(text)) return undefined
  try {
    const url = new URL(text)
    return LINK_PROTOCOLS.has(url.protocol) && (url.protocol === 'mailto:' || url.hostname) ? text : undefined
  } catch {
    // No scheme: an address only when it starts with a host name (`example.com`, `www.site.kz/x`).
  }
  if (!/^[\p{L}\d-]+(\.[\p{L}\d-]+)+([:/?#]|$)/u.test(text)) return undefined
  return URL.canParse(`https://${text}`) ? `https://${text}` : undefined
}
