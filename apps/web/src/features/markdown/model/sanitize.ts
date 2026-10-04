import DOMPurify from 'dompurify'

const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:'])
/** Images are shown only from the platform's own storage (no tracking pixels, no hotlinks). */
const PLATFORM_IMAGES = ['/content/', '/uploads/', '/api/uploads/', '/media/', '/static/uploads/']

/** A link target that is safe to render: http(s), mailto, or a relative / anchor link. Else undefined. */
export function safeUrl(value: string | null | undefined): string | undefined {
  const url = value?.trim()
  if (!url || url.startsWith('//')) return undefined
  if (/^(#|\/|\.\.?\/)/.test(url)) return url
  try {
    return SAFE_PROTOCOLS.has(new URL(url).protocol) ? url : undefined
  } catch {
    return undefined
  }
}

/** An image address from platform storage, else undefined. */
export const safeImageUrl = (value: string | null | undefined): string | undefined => {
  const url = safeUrl(value)
  return url && PLATFORM_IMAGES.some(prefix => url.startsWith(prefix)) ? url : undefined
}

/**
 * The one HTML sanitizer: every HTML string that reaches the DOM (legacy HTML posts, pasted HTML) goes
 * through it. Without a DOM (server render) it returns an empty string: fail closed, never pass through.
 */
export function sanitize(html: string): string {
  if (!DOMPurify.isSupported) return ''
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form'],
    FORBID_ATTR: ['style'],
  })
}

/** Markdown with raw HTML tags (rendered as text: the renderer never executes HTML). */
export const hasRawHtml = (markdown: string): boolean => /<\/?[a-z][\w:-]*(?:\s+[^>]*)?>/i.test(markdown)
