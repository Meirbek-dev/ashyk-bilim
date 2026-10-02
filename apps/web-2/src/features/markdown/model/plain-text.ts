// Backslash-escaped punctuation (`\*` from a WYSIWYG editor) is literal text: parked before the markup strip so
// `\*\*x\*\*` reads `**x**`, not `\\x\\` (UX-030).
const ESCAPED = /\\([\\`*_{}[\]()#+\-.!~|>$])/g
const PARKED = /(\d+)/g

/** Readable text of markdown (search, summaries, AI context). */
export function markdownPlainText(markdown: string): string {
  const parked: string[] = []
  return markdown
    .replace(/\r\n?/g, '\n')
    .replace(ESCAPED, (_match, char: string) => `${parked.push(char) - 1}`)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/[*_~|]/g, '')
    .replace(PARKED, (_match, index: string) => parked[Number(index)] ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** The first `maxLength` characters of the plain text, cut at a word when one ends late enough, with "…". */
export function markdownSummary(markdown: string, maxLength = 160): string {
  const text = markdownPlainText(markdown)
  if (text.length <= maxLength) return text
  const clipped = text.slice(0, Math.max(0, maxLength - 1)).trimEnd()
  const lastSpace = clipped.lastIndexOf(' ')
  return `${lastSpace > maxLength * 0.6 ? clipped.slice(0, lastSpace) : clipped}…`
}
