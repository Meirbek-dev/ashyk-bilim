import { useRef, useState } from 'react'

import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'

const HTML_TAG_PATTERN = /<[^>]*>/g
const HTML_ENTITY_PATTERNS: [RegExp, string][] = [
  [/&nbsp;/gi, ' '],
  [/&amp;/gi, '&'],
  [/&lt;/gi, '<'],
  [/&gt;/gi, '>'],
  [/&quot;/gi, '"'],
  [/&#39;/gi, "'"],
]

/** Blocks that say nothing while empty; any other leaf (image, video embed, …) is content. */
const EMPTY_BLOCKS = new Set([
  'doc',
  'paragraph',
  'heading',
  'hardBreak',
  'horizontalRule',
  'blockquote',
  'codeBlock',
  'bulletList',
  'orderedList',
  'listItem',
])

interface DocNode {
  type?: string
  text?: string
  content?: DocNode[]
}

function docHasContent(node: DocNode): boolean {
  if (node.type === 'text') return (node.text ?? '').trim().length > 0
  if (node.content?.length) return node.content.some(docHasContent)
  return !EMPTY_BLOCKS.has(node.type ?? '')
}

/** The editor's JSON document (what the composers hold), or `null` for HTML / plain text. */
function parseDoc(value: string): DocNode | null {
  if (!value.trimStart().startsWith('{')) return null
  try {
    const doc = JSON.parse(value) as DocNode
    return doc?.type === 'doc' ? doc : null
  } catch {
    return null
  }
}

/**
 * Whether a post says anything. The discussion editor emits its JSON document, so an emptied editor is
 * `{"type":"doc","content":[{"type":"paragraph"}]}` - not text, not «real text» (ROUND3-19). Stored posts may
 * also be HTML.
 */
export function hasMeaningfulText(value: string): boolean {
  const doc = parseDoc(value)
  if (doc) return docHasContent(doc)
  const stripped = HTML_ENTITY_PATTERNS.reduce(
    (current, [pattern, replacement]) => current.replace(pattern, replacement),
    value.replace(HTML_TAG_PATTERN, ' '),
  )

  return stripped.replace(/\s+/g, ' ').trim().length > 0
}

/**
 * One submission at a time (a double click on «Опубликовать» posted twice), and the caller learns whether it
 * worked: a form clears / closes only on success, so a failed post keeps the typed text.
 */
export function useSubmitOnce() {
  const busy = useRef(false)
  const [pending, setPending] = useState(false)
  const run = async (submit: () => Promise<boolean>): Promise<boolean> => {
    if (busy.current) return false
    busy.current = true
    setPending(true)
    const ok = await submit().catch(() => false)
    busy.current = false
    setPending(false)
    return ok
  }
  return { pending, run }
}

/** An open composer's text and what it opened with (`''` for a new post or reply); a closed one passes `''`. */
export interface ComposerDraft {
  content: string
  initial?: string
}

/** Real text that differs from what the composer opened with: an editor emptied back to `<p></p>` is clean. */
export const isComposerDirty = ({ content, initial = '' }: ComposerDraft) =>
  hasMeaningfulText(content) && content !== initial

/**
 * «Уйти без сохранения?» while any of a component's composers holds unsaved text (ROUND3-19) - one guard per
 * component, so one prompt. Render `UnsavedChangesDialog` with the result.
 */
export function useComposerGuard(...drafts: ComposerDraft[]) {
  return useUnsavedChangesGuard(drafts.some(isComposerDirty), { interceptInAppNavigation: true })
}
