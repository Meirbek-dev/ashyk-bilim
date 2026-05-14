/**
 * Integration test: AuthoringEditor with mixed blockEmbed + embedBlock document
 *
 * Verifies that both the legacy EmbedObjects (blockEmbed) extension and the new
 * EmbedBlock (embedBlock) extension can coexist in the same editor kernel and
 * that a document containing both node types loads without errors.
 *
 * Tests at the editor kernel level using @tiptap/core Editor directly to avoid
 * the complexity of mounting the full AuthoringEditor React component tree.
 *
 * Validates: Requirements 10.1, 10.2
 */

import { Editor, getSchema } from '@tiptap/core';
import { Node as PMNode } from '@tiptap/pm/model';
import { afterEach, describe, expect, it } from 'vitest';

import { createAuthoringEditorExtensions } from '../../components/Objects/Editor/core';

const activity = {
  activity_uuid: 'test-activity-uuid',
  name: 'Integration test activity',
};

// A document containing both a legacy blockEmbed node and a new embedBlock node
const mixedDocument = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Before embeds' }],
    },
    {
      // Legacy EmbedObjects node (blockEmbed)
      type: 'blockEmbed',
      attrs: {
        embedUrl: 'https://example.com/embed',
        embedCode: null,
        embedType: 'url',
        embedHeight: 300,
        embedWidth: '100%',
        alignment: 'left',
      },
    },
    {
      // New EmbedBlock node (embedBlock)
      type: 'embedBlock',
      attrs: {
        type: 'youtube',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        width: '100%',
        height: 500,
      },
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'After embeds' }],
    },
  ],
};

describe('AuthoringEditor integration: mixed blockEmbed + embedBlock document', () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  it('schema accepts both blockEmbed and embedBlock node types without conflict', () => {
    const extensions = createAuthoringEditorExtensions(activity);
    const schema = getSchema(extensions);

    // Both node types must be registered in the schema
    expect(schema.nodes['blockEmbed']).toBeDefined();
    expect(schema.nodes['embedBlock']).toBeDefined();

    // Node names must not conflict
    expect(schema.nodes['blockEmbed']).not.toBe(schema.nodes['embedBlock']);
  });

  it('parses a document containing both blockEmbed and embedBlock nodes without errors', () => {
    const extensions = createAuthoringEditorExtensions(activity);
    const schema = getSchema(extensions);

    // PMNode.fromJSON will throw if the document is invalid for the schema
    let parsedDoc: PMNode | null = null;
    expect(() => {
      parsedDoc = PMNode.fromJSON(schema, mixedDocument);
    }).not.toThrow();

    expect(parsedDoc).not.toBeNull();
  });

  it('preserves both node types through a JSON round-trip', () => {
    const extensions = createAuthoringEditorExtensions(activity);
    const schema = getSchema(extensions);

    const parsedDoc = PMNode.fromJSON(schema, mixedDocument);
    const serialized = parsedDoc.toJSON();

    // The document should contain 4 nodes: paragraph, blockEmbed, embedBlock, paragraph
    expect(serialized.content).toHaveLength(4);

    const blockEmbedNode = serialized.content[1];
    expect(blockEmbedNode.type).toBe('blockEmbed');
    expect(blockEmbedNode.attrs.embedUrl).toBe('https://example.com/embed');
    expect(blockEmbedNode.attrs.embedType).toBe('url');

    const embedBlockNode = serialized.content[2];
    expect(embedBlockNode.type).toBe('embedBlock');
    expect(embedBlockNode.attrs.type).toBe('youtube');
    expect(embedBlockNode.attrs.url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(embedBlockNode.attrs.height).toBe(500);
  });

  it('loads the mixed document into a live Editor instance without errors', () => {
    const extensions = createAuthoringEditorExtensions(activity);

    expect(() => {
      editor = new Editor({
        extensions,
        content: mixedDocument,
      });
    }).not.toThrow();

    expect(editor).not.toBeNull();

    const json = editor!.getJSON();
    expect(json.content).toHaveLength(4);

    // Verify blockEmbed node is present and intact
    const blockEmbedNode = json.content![1];
    expect(blockEmbedNode.type).toBe('blockEmbed');
    expect(blockEmbedNode.attrs?.embedUrl).toBe('https://example.com/embed');

    // Verify embedBlock node is present and intact
    const embedBlockNode = json.content![2];
    expect(embedBlockNode.type).toBe('embedBlock');
    expect(embedBlockNode.attrs?.type).toBe('youtube');
    expect(embedBlockNode.attrs?.url).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  });

  it('can insert an embedBlock node into a document that already contains a blockEmbed node', () => {
    const extensions = createAuthoringEditorExtensions(activity);

    editor = new Editor({
      extensions,
      content: {
        type: 'doc',
        content: [
          {
            type: 'blockEmbed',
            attrs: {
              embedUrl: 'https://example.com/embed',
              embedCode: null,
              embedType: 'url',
              embedHeight: 300,
              embedWidth: '100%',
              alignment: 'left',
            },
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'cursor here' }],
          },
        ],
      },
    });

    // Move cursor to the paragraph and insert an embedBlock
    editor.commands.focus('end');
    const result = editor.commands.insertEmbedBlock({
      type: 'excalidraw',
      url: 'https://excalidraw.com/#room=abc123',
    });

    expect(result).toBe(true);

    const json = editor.getJSON();
    const nodeTypes = json.content!.map((n) => n.type);

    // Both node types should coexist in the document
    expect(nodeTypes).toContain('blockEmbed');
    expect(nodeTypes).toContain('embedBlock');
  });
});
