/** Most identifiers one `POST /courses/{id}/learners` takes. */
export const MAX_ROSTER_IDENTIFIERS = 1000

const HEADER = /^(e-?mail|почта|эл\.?\s*почта|электронная почта|username|login|логин|user|пользователь|пайдаланушы)$/i

const unquote = (cell: string) =>
  cell
    .trim()
    .replace(/^"(.*)"$/s, '$1')
    .replaceAll('""', '"')
    .trim()

/** A pasted list: emails or usernames separated by new lines, commas, semicolons or tabs. */
export function parsePastedIdentifiers(text: string): string[] {
  return text
    .split(/[\r\n,;\t]+/)
    .map(unquote)
    .filter(Boolean)
}

/** File bytes as text: UTF-8, else Windows-1251 (the plain «CSV» of a Russian Excel). */
export function decodeCsv(bytes: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1251').decode(bytes)
  }
}

/**
 * A roster CSV: UTF-8 with or without BOM, `;` (Excel in the ru locale) or `,`
 * delimited, an optional header. Each row gives one identifier: the cell that
 * holds an email, else the first non-empty cell. Blank rows are skipped.
 */
export function parseRosterCsv(text: string): string[] {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r\n|\n|\r/)
    .filter(line => line.trim())
  const first = lines[0] ?? ''
  const delimiter = (first.match(/;/g)?.length ?? 0) >= (first.match(/,/g)?.length ?? 0) ? ';' : ','
  const rows = lines.map(line => line.split(delimiter).map(unquote).filter(Boolean))
  const head = rows[0] ?? []
  if (head.some(cell => HEADER.test(cell)) && !head.some(cell => cell.includes('@'))) rows.shift()
  return rows.map(cells => cells.find(cell => cell.includes('@')) ?? cells[0] ?? '').filter(Boolean)
}
