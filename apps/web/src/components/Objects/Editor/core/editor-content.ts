import type { Content, JSONContent } from '@tiptap/core'
import { toCodeBlockLanguageAttribute } from './code-block-languages'

export type TiptapJsonDoc = JSONContent & {
  type: 'doc'
  content: JSONContent[]
}

export const EMPTY_TIPTAP_DOC: TiptapJsonDoc = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isTiptapJsonDoc(content: unknown): content is TiptapJsonDoc {
  return isRecord(content) && content.type === 'doc' && Array.isArray(content.content)
}

function parseMaybeJsonString(content: unknown): unknown {
  if (typeof content !== 'string') {
    return content
  }

  try {
    return JSON.parse(content) as unknown
  } catch {
    return content
  }
}

function readStringAttr(attrs: Record<string, unknown> | null, key: string): string | null {
  const value = attrs?.[key]
  return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function legacyBlockQuizToInlineQuiz(node: JSONContent): JSONContent {
  const attrs = isRecord(node.attrs) ? node.attrs : null
  const assessmentUuid =
    readStringAttr(attrs, 'assessmentUuid') ??
    readStringAttr(attrs, 'assessment_uuid') ??
    readStringAttr(attrs, 'assessmentId') ??
    readStringAttr(attrs, 'assessment_id')

  return {
    type: 'inlineQuiz',
    attrs: {
      assessmentUuid,
    },
  }
}

function removeLegacyNodes(node: JSONContent): JSONContent {
  let normalizedNode = node

  if (normalizedNode.type === 'blockQuiz') {
    return legacyBlockQuizToInlineQuiz(normalizedNode)
  }

  if (normalizedNode.type === 'codeBlock') {
    normalizedNode = normalizeCodeBlockNode(normalizedNode)
  }

  if (!Array.isArray(normalizedNode.content)) {
    return normalizedNode
  }

  return {
    ...normalizedNode,
    content: normalizedNode.content.map(removeLegacyNodes),
  }
}

function normalizeCodeBlockNode(node: JSONContent): JSONContent {
  const attrs = isRecord(node.attrs) ? node.attrs : null
  const language = readStringAttr(attrs, 'language')
  const normalizedLanguage = toCodeBlockLanguageAttribute(language) ?? inferCodeBlockLanguage(node)

  if (!normalizedLanguage && !attrs) {
    return node
  }

  return {
    ...node,
    attrs: {
      ...attrs,
      language: normalizedLanguage,
    },
  }
}

function inferCodeBlockLanguage(node: JSONContent): ReturnType<typeof toCodeBlockLanguageAttribute> {
  const text = collectTextContent(node)

  if (looksLikeKotlin(text)) {
    return 'kotlin'
  }

  return null
}

function collectTextContent(node: JSONContent): string {
  if (typeof node.text === 'string') {
    return node.text
  }

  if (!Array.isArray(node.content)) {
    return ''
  }

  return node.content.map(collectTextContent).join('\n')
}

function looksLikeKotlin(text: string): boolean {
  let score = 0

  if (/\bdata\s+class\b/.test(text)) score += 3
  if (/\b(listOf|mutableListOf|mapOf|mutableMapOf|setOf|firstOrNull)\b/.test(text)) score += 2
  if (/\b(groupBy|sortedBy|sortedByDescending)\s*\{/.test(text)) score += 2
  if (/\{\s*it\./.test(text)) score += 2
  if (/^\s*object\s+\w+/m.test(text)) score += 2
  if (/\{\s*\w+\s*->/.test(text)) score += 2
  if (/\w+\s*:\s*\([^)]*\)\s*->\s*\w+/.test(text)) score += 2
  if (/^\s*(val|var)\s+\w+/m.test(text)) score += 1
  if (/\bfun\s+\w+\s*\(/.test(text)) score += 1
  if (/\bcompanion\s+object\b/.test(text)) score += 1

  return score >= 2
}

export function removeLegacyBlockQuizNodes(content: TiptapJsonDoc): TiptapJsonDoc {
  return {
    ...content,
    content: content.content.map(removeLegacyNodes),
  }
}

export function normalizeTiptapJsonContent(content: unknown, fallback: Content = EMPTY_TIPTAP_DOC): Content {
  const parsedContent = parseMaybeJsonString(content)

  if (isTiptapJsonDoc(parsedContent)) {
    return removeLegacyBlockQuizNodes(parsedContent)
  }

  if (isRecord(parsedContent) && Array.isArray(parsedContent.content)) {
    return removeLegacyBlockQuizNodes({
      type: 'doc',
      content: parsedContent.content,
    })
  }

  return fallback
}
