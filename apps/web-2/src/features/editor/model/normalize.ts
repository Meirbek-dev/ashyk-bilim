import { codeLanguage, looksLikeKotlin } from './code-languages'
import {
  EMPTY_DOCUMENT,
  isDocument,
  isRecord,
  numberAttr,
  textAttr,
  type EditorDocument,
  type EditorNode,
} from './document'
import { embedTypeForUrl } from './embed'

/**
 * The one reader of stored editor content. It knows the legacy shapes and nothing else does:
 *   - `blockEmbed` (old "embed objects" node) -> canonical `embedBlock` (migration D-01);
 *   - `youtube` (old @tiptap/extension-youtube node) -> `embedBlock` of type `youtube`;
 *   - code blocks with an alias or no language -> a known language or null (Kotlin is inferred);
 *   - a JSON string -> the parsed document; any other string is legacy HTML and is returned as is.
 * Delete the first two branches in phase 9, after D-01 has run on production (SPEC "Не переносится после D-01").
 * Idempotent: normalizeDocument(normalizeDocument(x)) equals normalizeDocument(x).
 */
export function normalizeDocument(raw: unknown): EditorDocument | string {
  const value = parseJson(raw)
  if (typeof value === 'string') return value.trim() ? value : EMPTY_DOCUMENT
  if (isDocument(value)) return { ...value, content: value.content.map(normalizeNode) }
  if (isRecord(value) && Array.isArray(value['content']))
    return { type: 'doc', content: value['content'].filter(isRecord).map(normalizeNode) }
  return EMPTY_DOCUMENT
}

function parseJson(raw: unknown): unknown {
  if (typeof raw !== 'string' || !/^\s*[{[]/.test(raw)) return raw
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return raw
  }
}

function normalizeNode(node: EditorNode): EditorNode {
  const own = node.type === 'blockEmbed' ? legacyEmbed(node) : node.type === 'youtube' ? legacyYouTube(node) : node
  const next = own.type === 'codeBlock' ? codeBlock(own) : own
  return Array.isArray(next.content) ? { ...next, content: next.content.map(normalizeNode) } : next
}

/** First iframe `src` of a pasted embed code (old "code" embeds; none in production). */
const iframeSrc = (code: string | null) =>
  code ? (/<iframe[^>]*\ssrc=["']([^"']+)["']/i.exec(code)?.[1] ?? null) : null

/**
 * D-01. blockEmbed {embedUrl, embedCode, embedType, embedHeight, embedWidth, alignment}
 *    -> embedBlock {type: embedTypeForUrl(url), url, width: embedWidth ?? '100%', height: embedHeight ?? 300}.
 * embedType ('url' | 'code'), embedCode (only its iframe src is kept) and alignment (an embed narrower than the
 * column is centered) are dropped.
 */
function legacyEmbed(node: EditorNode): EditorNode {
  const attrs = node.attrs ?? {}
  const url = textAttr(attrs['embedUrl'])?.trim() ?? iframeSrc(textAttr(attrs['embedCode']))
  return {
    type: 'embedBlock',
    attrs: {
      type: url ? embedTypeForUrl(url) : null,
      url,
      width: textAttr(attrs['embedWidth']) ?? '100%',
      height: numberAttr(attrs['embedHeight']) ?? 300,
    },
  }
}

/** youtube {src, start, width, height} -> embedBlock {type: 'youtube', url: src, width: '100%', height}. */
function legacyYouTube(node: EditorNode): EditorNode {
  const url = textAttr(node.attrs?.['src'])
  return {
    type: 'embedBlock',
    attrs: { type: url ? 'youtube' : null, url, width: '100%', height: numberAttr(node.attrs?.['height']) ?? 480 },
  }
}

const textOf = (node: EditorNode): string =>
  typeof node.text === 'string' ? node.text : (node.content ?? []).map(textOf).join('\n')

function codeBlock(node: EditorNode): EditorNode {
  const stored = textAttr(node.attrs?.['language'])
  const language = codeLanguage(stored) ?? (looksLikeKotlin(textOf(node)) ? 'kotlin' : null)
  if (language === (node.attrs?.['language'] ?? null)) return node
  return { ...node, attrs: { ...node.attrs, language } }
}
