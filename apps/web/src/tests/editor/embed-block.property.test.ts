/**
 * Property-based tests for EmbedBlock HTML serialization round-trip and no-op behavior.
 *
 * Feature: rich-text-editor, Property 7: EmbedBlock HTML serialization round-trip preserves all attributes
 * Feature: rich-text-editor, Property 10: updateEmbedBlock is a no-op at positions without an embedBlock node
 *
 * Validates: Requirements 7.7, 7.8, 7.5
 */

import { Editor, getSchema } from '@tiptap/core'
import { DOMParser as PMDOMParser, DOMSerializer, Node as PMNode } from '@tiptap/pm/model'
import { StarterKit } from '@tiptap/starter-kit'
import * as fc from 'fast-check'
import { afterEach, describe, expect, it } from 'vite-plus/test'

import { EmbedBlock } from '../../components/Objects/Editor/Extensions/EmbedBlock/EmbedBlock'
import type { EmbedType } from '../../components/Objects/Editor/Extensions/EmbedBlock/embed-options'

// ---------------------------------------------------------------------------
// Schema setup — StarterKit provides the required doc/text/paragraph nodes
// ---------------------------------------------------------------------------

const schema = getSchema([StarterKit, EmbedBlock])

// ---------------------------------------------------------------------------
// Round-trip helpers
// ---------------------------------------------------------------------------

/**
 * Serialize an embedBlock node to a DOM element using ProseMirror's
 * DOMSerializer (which calls the extension's renderHTML), then parse it back
 * using ProseMirror's DOMParser (which calls parseHTML).
 *
 * Returns the parsed node's attrs.
 */
function htmlRoundTrip(attrs: { type: EmbedType; url: string; width: string; height: number }): {
  type: string | null
  url: string | null
  width: string
  height: number
} {
  // Build the ProseMirror node from JSON
  const nodeJson = {
    type: 'embedBlock',
    attrs,
  }
  const pmNode = PMNode.fromJSON(schema, nodeJson)

  // Serialize to DOM fragment
  const serializer = DOMSerializer.fromSchema(schema)
  const container = document.createElement('div')
  serializer.serializeFragment(pmNode.content, { document }, container)
  // serializeFragment appends to container; for an atom node we need to serialize the node itself
  const nodeContainer = document.createElement('div')
  const serializedNode = serializer.serializeNode(pmNode, { document })
  nodeContainer.appendChild(serializedNode)

  // Parse back using ProseMirror DOMParser
  const parser = PMDOMParser.fromSchema(schema)
  const parsedDoc = parser.parse(nodeContainer)

  // The parsed doc should have one child: the embedBlock node
  const parsedNode = parsedDoc.firstChild
  if (!parsedNode) {
    throw new Error('DOMParser produced an empty document')
  }

  return {
    type: parsedNode.attrs['type'] as string | null,
    url: parsedNode.attrs['url'] as string | null,
    width: parsedNode.attrs['width'] as string,
    height: parsedNode.attrs['height'] as number,
  }
}

// ---------------------------------------------------------------------------
// Property 7: EmbedBlock HTML serialization round-trip preserves all attributes
// ---------------------------------------------------------------------------

describe('EmbedBlock HTML round-trip (Property 7)', () => {
  // Feature: rich-text-editor, Property 7: EmbedBlock HTML serialization round-trip preserves all attributes
  it('preserves type, url, width, and height through renderHTML → parseHTML', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<EmbedType>('youtube', 'excalidraw', 'tldraw', 'figma', 'desmos'),
        fc.string({ minLength: 1 }),
        fc.constantFrom('100%' as const, '80%' as const, '60%' as const),
        fc.integer({ min: 200, max: 1200 }),
        (type, url, width, height) => {
          const result = htmlRoundTrip({ type, url, width, height })

          expect(result.type).toBe(type)
          expect(result.url).toBe(url)
          expect(result.width).toBe(width)
          expect(result.height).toBe(height)
        },
      ),
      { numRuns: 100 },
    )
  })
})

// ---------------------------------------------------------------------------
// Property 10: updateEmbedBlock is a no-op at positions without an embedBlock node
// ---------------------------------------------------------------------------

describe('updateEmbedBlock no-op behavior (Property 10)', () => {
  // Feature: rich-text-editor, Property 10: updateEmbedBlock is a no-op at positions without an embedBlock node
  // Validates: Requirements 7.5

  let editor: Editor | null = null

  afterEach(() => {
    editor?.destroy()
    editor = null
  })

  it('leaves the document unchanged when called at any position in a document without embedBlock nodes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0 }), pos => {
        // Create a fresh editor with a simple paragraph document (no embedBlock nodes)
        editor = new Editor({
          extensions: [StarterKit, EmbedBlock],
          content: {
            type: 'doc',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }],
          },
        })

        const before = JSON.stringify(editor.getJSON())

        // Should not throw and should be a no-op
        expect(() => {
          editor!.commands.updateEmbedBlock(pos, { url: 'https://example.com' })
        }).not.toThrow()

        const after = JSON.stringify(editor.getJSON())
        expect(after).toBe(before)

        editor.destroy()
        editor = null
      }),
      { numRuns: 100 },
    )
  })
})
