import { normalizeMarkdown } from './markdown-sanitize'

// Backslash-escaped punctuation (`\*` from a WYSIWYG editor) is literal text:
// parked before the markup strip so `\*\*x\*\*` reads `**x**`, not `\\x\\` (UX-030).
const ESCAPED_PUNCTUATION = /\\([\\`*_{}[\]()#+\-.!~|>])/g
const PARKED = /\uE000(\d+)\uE001/g

export function extractMarkdownPlainText(markdown: string): string {
  const parked: string[] = []
  return normalizeMarkdown(markdown)
    .replace(ESCAPED_PUNCTUATION, (_match, char: string) => `\uE000${parked.push(char) - 1}\uE001`)
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

export function extractMarkdownSummary(markdown: string, maxLength = 160): string {
  const text = extractMarkdownPlainText(markdown)
  if (text.length <= maxLength) return text
  const clipped = text.slice(0, Math.max(0, maxLength - 1)).trimEnd()
  const lastSpace = clipped.lastIndexOf(' ')
  const readable = lastSpace > maxLength * 0.6 ? clipped.slice(0, lastSpace) : clipped
  return `${readable}…`
}
