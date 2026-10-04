import type { JSONContent } from '@tiptap/core'

import { isFileBlock } from './file-blocks'

/** A Tiptap JSON node as stored in `activities.content` (contract schema `EditorDocument`). */
export type EditorNode = JSONContent

export type EditorDocument = JSONContent & { type: 'doc'; content: JSONContent[] }

export const EMPTY_DOCUMENT: EditorDocument = { type: 'doc', content: [{ type: 'paragraph' }] }

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

export const isDocument = (value: unknown): value is EditorDocument =>
  isRecord(value) && value['type'] === 'doc' && Array.isArray(value['content'])

/** A non-blank string attribute, else null. */
export const textAttr = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null

/** A finite number attribute (numeric strings too), else null. */
export const numberAttr = (value: unknown): number | null => {
  const parsed = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null
}

// A storage key is plain segments: no traversal, no query or fragment, no backslash, no control character, and
// no `%` (so no percent-encoded form of any of these). Each segment is encoded again below.
const UNSAFE_KEY = /\.\.|[\\?#%]|\p{Cc}|^\/|\/\/|\/$/u

/**
 * Public URL of a block file, always under `/content/` (B-EDT-21); ETL-migrated rows without `file_key` resolve
 * `<file_id>.<file_format>`. An unsafe key is no file (null).
 */
export function blockFileUrl(blockObject: unknown): string | null {
  if (!isRecord(blockObject) || !isRecord(blockObject['content'])) return null
  const content = blockObject['content']
  const id = textAttr(content['file_id'])
  const format = textAttr(content['file_format'])
  const key = textAttr(content['file_key']) ?? (id && format ? `${id}.${format}` : null)
  if (!key) return null
  if (/^https:\/\//i.test(key)) return key
  if (UNSAFE_KEY.test(key)) return null
  const path = `/content/${key.split('/').map(encodeURIComponent).join('/')}`
  return new URL(path, 'https://x.invalid').pathname === path ? path : null
}

const stripNode = (node: JSONContent): JSONContent =>
  Array.isArray(node.content)
    ? {
        ...node,
        content: node.content
          .filter(child => !(isFileBlock(child.type ?? '') && !child.attrs?.['blockObject']))
          .map(stripNode),
      }
    : node

/** Image, PDF and video blocks that never received an upload are editor chrome: autosave drops them (UX-058). */
export function stripEmptyFileBlocks(doc: EditorDocument): EditorDocument {
  const stripped = stripNode(doc)
  return stripped.content?.length ? { type: 'doc', content: stripped.content } : EMPTY_DOCUMENT
}
