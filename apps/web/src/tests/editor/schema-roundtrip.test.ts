/**
 * Schema round-trip tests using ProseMirror's pure JSON API.
 * Tiptap's `getSchema` + ProseMirror `Node.fromJSON` / `.toJSON()` are
 * DOM-free and run in a Node environment without jsdom.
 */
import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { Node as PMNode } from '@tiptap/pm/model';
import { HeadingWithIds } from '../../components/Objects/Editor/core/heading-with-ids';

// Build a minimal schema that includes HeadingWithIds
const schema = getSchema([
  StarterKit.configure({ heading: false }),
  HeadingWithIds.configure({ levels: [1, 2, 3, 4, 5, 6] }),
]);

function roundTrip(json: object): object {
  return PMNode.fromJSON(schema, json).toJSON();
}

describe('Schema JSON round-trip', () => {
  it('preserves a simple paragraph', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Hello, world!' }],
        },
      ],
    };
    expect(roundTrip(doc)).toEqual(doc);
  });

  it('preserves bold and italic marks', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
            { type: 'text', text: ' ' },
            { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
          ],
        },
      ],
    };
    expect(roundTrip(doc)).toEqual(doc);
  });

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
    };
    expect(roundTrip(doc)).toEqual(doc);
  });

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
    };
    expect(roundTrip(doc)).toEqual(doc);
  });

  it('preserves a bullet list', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item one' }] }],
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Item two' }] }],
            },
          ],
        },
      ],
    };
    expect(roundTrip(doc)).toEqual(doc);
  });

  it('preserves nested marks (bold + italic)', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'emphasis',
              marks: [{ type: 'bold' }, { type: 'italic' }],
            },
          ],
        },
      ],
    };
    const result = roundTrip(doc) as typeof doc;
    // Marks may be reordered by ProseMirror; just check both are present
    type DocShape = { content?: Array<{ content?: Array<{ marks?: Array<{ type: string }> }> }> };
    const marks = ((result as DocShape).content?.[0]?.content?.[0]?.marks ?? []).map((m) => m.type);
    expect(marks).toContain('bold');
    expect(marks).toContain('italic');
  });

  it('preserves an empty doc', () => {
    const doc = { type: 'doc', content: [{ type: 'paragraph' }] };
    expect(roundTrip(doc)).toEqual(doc);
  });
});
