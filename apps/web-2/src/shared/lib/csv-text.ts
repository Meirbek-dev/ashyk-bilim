/** File bytes as text: UTF-8, else Windows-1251 (the plain «CSV» of a Russian Excel). */
export function decodeCsv(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1251').decode(bytes)
  }
}
