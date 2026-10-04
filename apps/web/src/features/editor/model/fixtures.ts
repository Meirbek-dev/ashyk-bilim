import type { EditorDocument, EditorNode } from './document'

const doc = (...content: EditorNode[]): EditorDocument => ({ type: 'doc', content })
const p = (text: string): EditorNode => ({ type: 'paragraph', content: [{ type: 'text', text }] })

/** Every node of the old schema, from apps/web/src/tests/editor/*-roundtrip.test.ts plus prod-shaped attrs. */
export const FIXTURES: Record<string, EditorDocument> = {
  paragraph: doc(p('Hello, world!')),
  marks: doc({
    type: 'paragraph',
    content: [
      { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'code', marks: [{ type: 'code' }] },
      { type: 'text', text: ' ' },
      { type: 'text', text: 'strike', marks: [{ type: 'strike' }, { type: 'underline' }] },
      {
        type: 'text',
        text: 'link',
        marks: [
          {
            type: 'link',
            attrs: {
              href: 'https://example.com',
              target: '_blank',
              rel: 'noopener noreferrer nofollow',
              class: null,
              title: 'Example',
            },
          },
        ],
      },
    ],
  }),
  heading: doc({
    type: 'heading',
    attrs: { level: 2, id: 'привет-мир' },
    content: [{ type: 'text', text: 'Привет Мир' }],
  }),
  lists: doc(
    { type: 'bulletList', content: [{ type: 'listItem', content: [p('one')] }] },
    { type: 'orderedList', attrs: { start: 3, type: null }, content: [{ type: 'listItem', content: [p('two')] }] },
  ),
  quoteRuleBreak: doc(
    { type: 'blockquote', content: [p('quote')] },
    { type: 'horizontalRule' },
    { type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: 'b' }] },
  ),
  codeBlock: doc({ type: 'codeBlock', attrs: { language: 'kotlin' }, content: [{ type: 'text', text: 'val x = 1' }] }),
  table: doc({
    type: 'table',
    content: [
      {
        type: 'tableRow',
        content: [
          {
            type: 'tableHeader',
            attrs: { colspan: 1, rowspan: 1, colwidth: [120], align: 'center' },
            content: [p('h')],
          },
        ],
      },
      {
        type: 'tableRow',
        content: [
          { type: 'tableCell', attrs: { colspan: 2, rowspan: 1, colwidth: null, align: 'left' }, content: [p('c')] },
        ],
      },
    ],
  }),
  calloutInfo: doc({ type: 'calloutInfo', content: [p('Remember this.')] }),
  calloutWarning: doc({ type: 'calloutWarning', content: [p('Careful.')] }),
  badge: doc({ type: 'badge', attrs: { color: 'sky', emoji: '💡' }, content: [p('Key idea')] }),
  button: doc({
    type: 'button',
    attrs: { emoji: '🔗', link: 'https://example.com', color: 'blue', alignment: 'left' },
    content: [{ type: 'text', text: 'Visit site' }],
  }),
  embedBlock: doc({
    type: 'embedBlock',
    attrs: { type: 'excalidraw', url: 'https://excalidraw.com/#json=a,b', width: '100%', height: 520 },
  }),
  flipcard: doc({
    type: 'flipcard',
    attrs: {
      question: 'What is photosynthesis?',
      answer: 'Energy from light.',
      color: 'blue',
      alignment: 'center',
      size: 'medium',
    },
  }),
  image: doc({
    type: 'blockImage',
    attrs: {
      blockObject: { block_uuid: 'img-1', content: { file_id: 'image', file_format: 'png' } },
      size: { width: 420 },
      alignment: 'center',
    },
  }),
  imageWithoutSize: doc({
    type: 'blockImage',
    attrs: {
      blockObject: { block_uuid: 'img-2', content: { file_id: 'f', file_key: 'platform/x.webp', file_format: 'webp' } },
      size: null,
      alignment: 'center',
    },
  }),
  math: doc({ type: 'blockMathEquation', attrs: { math_equation: 'x^2 + y^2 = z^2', html: '' } }),
  pdf: doc({
    type: 'blockPDF',
    attrs: {
      blockObject: { block_uuid: 'pdf-1', content: { file_id: 'handout', file_format: 'pdf' } },
      size: { width: 840, height: 640 },
    },
  }),
  scenarios: doc({
    type: 'scenarios',
    attrs: {
      title: 'Decision path',
      currentScenarioId: '1',
      scenarios: [
        { id: '1', text: 'Choose a path', options: [{ id: 'opt-1', text: 'Continue', nextScenarioId: '2' }] },
        { id: '2', text: 'The end', options: [] },
      ],
    },
  }),
  user: doc({ type: 'blockUser', attrs: { user_id: '0199a8d5-da4c-753b-a6c4-a08d294bbab5' } }),
  video: doc({
    type: 'blockVideo',
    attrs: {
      blockObject: { block_uuid: 'video-1', content: { file_id: 'intro', file_format: 'mp4' }, size: 'medium' },
    },
  }),
  webPreview: doc({
    type: 'blockWebPreview',
    attrs: {
      url: 'https://example.com',
      title: 'Example',
      description: 'Example description',
      og_image: null,
      favicon: null,
      og_type: 'website',
      og_url: 'https://example.com',
      site_name: 'Example',
      alignment: 'left',
      buttonLabel: 'Visit',
      showButton: true,
      openInPopup: false,
    },
  }),
}

/** A legacy `blockEmbed` exactly as 87 production nodes store it. */
export const LEGACY_EMBED: EditorNode = {
  type: 'blockEmbed',
  attrs: {
    embedUrl: 'https://docs.google.com/document/d/1C0g/edit?usp=sharing',
    alignment: 'left',
    embedCode: null,
    embedType: 'url',
    embedWidth: '100%',
    embedHeight: 667,
  },
}
