/** Save a fetched body as a file. Bytes go through untouched (a CSV keeps its UTF-8 BOM — UX-113). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

/** The server-chosen name from `Content-Disposition: attachment; filename="x.csv"` (RFC 5987 `filename*=` wins). */
export function filenameFromContentDisposition(header: string | null | undefined, fallback: string): string {
  if (!header) return fallback
  const star = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(header)?.[1]
  if (star) {
    try {
      return decodeURIComponent(star.trim().replace(/^"|"$/g, ''))
    } catch {
      /* fall through to the plain form */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header)?.[1]?.trim()
  return plain || fallback
}
