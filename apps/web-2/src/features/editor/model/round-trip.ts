import { getSchema, type AnyExtension } from '@tiptap/core'
import { Node as PMNode } from '@tiptap/pm/model'

import { isRecord, type EditorNode } from './document'

export type Loss = { path: string; what: string }

/** Parses a JSON document with the editor schema and serializes it back, as loading and saving would. */
export function serializeWith(extensions: AnyExtension[]): (doc: EditorNode) => EditorNode {
  const schema = getSchema(extensions)
  return doc => {
    const json: unknown = PMNode.fromJSON(schema, doc).toJSON()
    return isRecord(json) ? json : {}
  }
}

const same = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right)

/**
 * What the schema dropped or changed between a document and its round trip: node types, attributes
 * (a value equal to nothing stored is fine), marks, text and child counts. Empty = lossless.
 */
export function findLosses(before: EditorNode, after: EditorNode, path = 'doc'): Loss[] {
  if (before.type !== after.type) return [{ path, what: `node ${before.type} became ${after.type}` }]
  const losses: Loss[] = []
  for (const [key, value] of Object.entries(before.attrs ?? {})) {
    if (value !== null && value !== undefined && !same(value, after.attrs?.[key]))
      losses.push({ path, what: `${before.type}.${key} dropped` })
  }
  if (before.text !== after.text) losses.push({ path, what: 'text changed' })
  for (const mark of before.marks ?? []) {
    if (
      !(after.marks ?? []).some(
        kept => kept.type === mark.type && same(kept.attrs ?? {}, { ...kept.attrs, ...mark.attrs }),
      )
    )
      losses.push({ path, what: `mark ${mark.type} dropped` })
  }
  const children = before.content ?? []
  const kept = after.content ?? []
  if (children.length !== kept.length)
    losses.push({ path, what: `${children.length - kept.length} child nodes dropped` })
  else children.forEach((child, index) => losses.push(...findLosses(child, kept[index] ?? {}, `${path}/${index}`)))
  return losses
}
