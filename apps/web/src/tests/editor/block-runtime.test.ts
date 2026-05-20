import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';

import {
  normalizeCodeBlockLanguage,
  PLAIN_TEXT_CODE_BLOCK_LANGUAGE,
} from '../../components/Objects/Editor/core/code-block-languages';
import { createAuthoringEditorExtensions } from '../../components/Objects/Editor/core';
import { normalizeTiptapJsonContent } from '../../components/Objects/Editor/core/editor-content';

const activity = {
  activity_uuid: 'activity_123',
  name: 'Sample activity',
};

function createEditor() {
  return new Editor({
    editable: true,
    extensions: createAuthoringEditorExtensions(activity),
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
  });
}

const runtimeCases = [
  { title: 'info callout', run: (editor: Editor) => editor.commands.insertInfoCallout(), expectedType: 'calloutInfo' },
  {
    title: 'warning callout',
    run: (editor: Editor) => editor.commands.insertWarningCallout(),
    expectedType: 'calloutWarning',
  },
  { title: 'badge', run: (editor: Editor) => editor.commands.insertBadge(), expectedType: 'badge' },
  { title: 'button', run: (editor: Editor) => editor.commands.insertButton(), expectedType: 'button' },
  { title: 'embed object', run: (editor: Editor) => editor.commands.insertEmbedObject(), expectedType: 'blockEmbed' },
  { title: 'flipcard', run: (editor: Editor) => editor.commands.insertFlipcard(), expectedType: 'flipcard' },
  { title: 'image block', run: (editor: Editor) => editor.commands.insertImageBlock(), expectedType: 'blockImage' },
  {
    title: 'math equation',
    run: (editor: Editor) => editor.commands.insertMathEquation(),
    expectedType: 'blockMathEquation',
  },
  { title: 'pdf block', run: (editor: Editor) => editor.commands.insertPDFBlock(), expectedType: 'blockPDF' },
  { title: 'inline quiz', run: (editor: Editor) => editor.commands.insertInlineQuiz(), expectedType: 'inlineQuiz' },
  { title: 'scenario block', run: (editor: Editor) => editor.commands.insertScenarios(), expectedType: 'scenarios' },
  { title: 'user block', run: (editor: Editor) => editor.commands.insertUserBlock(), expectedType: 'blockUser' },
  { title: 'video block', run: (editor: Editor) => editor.commands.insertVideoBlock(), expectedType: 'blockVideo' },
  {
    title: 'web preview',
    run: (editor: Editor) => editor.commands.insertWebPreview(),
    expectedType: 'blockWebPreview',
  },
];

describe('custom block runtime commands', () => {
  let editor: Editor | null = null;

  afterEach(() => {
    editor?.destroy();
    editor = null;
  });

  for (const testCase of runtimeCases) {
    it(`inserts ${testCase.title}`, () => {
      editor = createEditor();

      expect(testCase.run(editor)).toBe(true);

      const doc = editor.getJSON();
      expect(doc.content?.[0]?.type).toBe(testCase.expectedType);
    });
  }

  it('persists kotlin as a code block language', () => {
    editor = createEditor();

    expect(editor.commands.setCodeBlock({ language: 'kotlin' })).toBe(true);

    const doc = editor.getJSON();
    expect(doc.content?.[0]).toMatchObject({
      type: 'codeBlock',
      attrs: { language: 'kotlin' },
    });
  });

  it('normalizes kotlin code block aliases', () => {
    expect(normalizeCodeBlockLanguage('kt')).toBe('kotlin');
    expect(normalizeCodeBlockLanguage('kts')).toBe('kotlin');
    expect(normalizeCodeBlockLanguage('Kotlin')).toBe('kotlin');
    expect(normalizeCodeBlockLanguage('')).toBe(PLAIN_TEXT_CODE_BLOCK_LANGUAGE);
  });

  it('normalizes saved kotlin code block language attributes', () => {
    const content = normalizeTiptapJsonContent({
      type: 'doc',
      content: [
        {
          type: 'codeBlock',
          attrs: { language: 'Kotlin' },
          content: [{ type: 'text', text: 'class Book' }],
        },
      ],
    });

    expect(content).toMatchObject({
      type: 'doc',
      content: [{ type: 'codeBlock', attrs: { language: 'kotlin' } }],
    });
  });

  it('infers kotlin for legacy code blocks without a language attribute', () => {
    const examples = [
      'val topClassics = books.filter { it.rating >= 4.5 }',
      'object AppConfig {\n  const val BASE_URL = "https://openlibrary.org/"\n}',
      'val double: (Int) -> Int = { x -> x * 2 }',
    ];

    for (const example of examples) {
      const content = normalizeTiptapJsonContent({
        type: 'doc',
        content: [
          {
            type: 'codeBlock',
            attrs: {},
            content: [{ type: 'text', text: example }],
          },
        ],
      });

      expect(content).toMatchObject({
        type: 'doc',
        content: [{ type: 'codeBlock', attrs: { language: 'kotlin' } }],
      });
    }
  });
});
