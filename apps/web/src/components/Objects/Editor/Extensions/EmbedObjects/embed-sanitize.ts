import DOMPurify from 'dompurify'

// Iframe attributes that YouTube, Vimeo, Google Maps, Figma, CodePen, etc. put in their embed snippets.
// DOMPurify's defaults already keep src/width/height/title/loading/style and strip on* handlers and
// javascript:/data: URIs.
const EMBED_IFRAME_ATTRS = [
  'allow',
  'allowfullscreen',
  'allowtransparency',
  'frameborder',
  'referrerpolicy',
  'scrolling',
]

export const sanitizeEmbedCode = (code: string): string =>
  DOMPurify.sanitize(code, { ADD_TAGS: ['iframe'], ADD_ATTR: EMBED_IFRAME_ATTRS })

/** Returns an http(s) URL for the embed iframe, or '' when the input is not one. Bare hosts get https://. */
export const sanitizeEmbedUrl = (url: string): string => {
  const trimmed = url.trim()
  if (!trimmed) return ''

  const candidate = /^[a-z][\d+.a-z-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`
  try {
    const { protocol } = new URL(candidate)
    return protocol === 'http:' || protocol === 'https:' ? candidate : ''
  } catch {
    return ''
  }
}
