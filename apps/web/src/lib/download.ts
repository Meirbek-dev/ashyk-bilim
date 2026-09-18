/** Save a fetched body as a file. Bytes go through untouched (a CSV keeps its UTF-8 BOM — UX-113). */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}
