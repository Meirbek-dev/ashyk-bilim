type PdfFrameProps = {
  /** A same-origin path (`/content/<key>`); anything else renders nothing. */
  src: string
  title: string
  height?: number
}

/**
 * A PDF of our storage in the browser's own viewer. The frame is not sandboxed because Chromium shows no PDF in a
 * sandboxed frame; same-origin paths only, so no foreign page ever runs in it (CSP frame-src 'self' as well).
 */
export function PdfFrame({ src, title, height = 540 }: PdfFrameProps) {
  if (!src.startsWith('/') || src.startsWith('//')) return null
  return <iframe src={src} title={title} height={height} className="w-full rounded-lg border border-border" />
}
