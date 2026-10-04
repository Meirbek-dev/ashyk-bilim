type PdfFrameProps = {
  /** A same-origin path under `FRAME_PREFIXES` (`/content/<key>`, a signed `/ab-*` path); anything else renders nothing. */
  src: string
  title: string
  height?: number
}

// Our storage (public files, signed bucket paths) and server-made PDFs (certificate preview).
const FRAME_PREFIXES = ['/content/', '/ab-private/', '/ab-public/', '/api/v2/']
const BASE = 'https://frame.invalid'

/**
 * The path a PdfFrame may show, or null: relative to our origin, under `FRAME_PREFIXES`, and no traversal or
 * backslash in the path (raw or percent-encoded), so `/content/../ab-private/x.html` never escapes its prefix.
 */
export function framePath(src: string): string | null {
  const path = src.split(/[?#]/u)[0] ?? ''
  if (!path.startsWith('/') || /\.\.|\\|%2e|%2f|%5c/iu.test(path)) return null
  try {
    const url = new URL(src, BASE)
    return url.origin === BASE && FRAME_PREFIXES.some(prefix => url.pathname.startsWith(prefix))
      ? `${url.pathname}${url.search}`
      : null
  } catch {
    return null
  }
}

/**
 * A PDF of our storage in the browser's own viewer. The frame is not sandboxed because Chromium shows no PDF in a
 * sandboxed frame; same-origin storage paths only (`framePath`), so no foreign page ever runs in it.
 */
export function PdfFrame({ src, title, height = 540 }: PdfFrameProps) {
  const path = framePath(src)
  if (!path) return null
  return <iframe src={path} title={title} height={height} className="w-full rounded-lg border border-border" />
}
