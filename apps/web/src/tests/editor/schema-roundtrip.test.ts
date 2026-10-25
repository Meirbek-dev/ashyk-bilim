/**
 * Schema round-trip tests using ProseMirror's pure JSON API.
 * Tiptap's `getSchema` + ProseMirror `Node.fromJSON` / `.toJSON()` are
 * DOM-free and run in a Node environment without jsdom.
 */
import { describe, expect, it } from 'vite-plus/test'
import { getSchema } from '@tiptap/core'
import { StarterKit } from '@tiptap/starter-kit'
import { Node as PMNode } from '@tiptap/pm/model'
import { HeadingWithIds } from '../../components/Objects/Editor/core/heading-with-ids'

// Build a minimal schema that includes HeadingWithIds
const schema = getSchema([
  StarterKit.configure({ heading: false }),
  HeadingWithIds.configure({ levels: [1, 2, 3, 4, 5, 6] }),
])

function roundTrip(json: object): object {
  return PMNode.fromJSON(schema, json).toJSON()
}

describe('Schema JSON round-trip', () => {
  it('preserves headings with id attribute', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 1, id: 'introduction' },
          content: [{ type: 'text', text: 'Introduction' }],
        },
      ],
    }
    expect(roundTrip(doc)).toEqual(doc)
  })

  it('preserves a heading with Cyrillic id', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'heading',
          attrs: { level: 2, id: 'привет-мир' },
          content: [{ type: 'text', text: 'Привет Мир' }],
        },
      ],
    }
    expect(roundTrip(doc)).toEqual(doc)
  })
})
