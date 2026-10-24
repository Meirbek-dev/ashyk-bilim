/**
 * Attribute defaults of the custom blocks (the JSON contract, D-01 aside), Tiptap-free: the schema (blocks.ts,
 * embed-block.ts) declares them and the static viewer fills a stored node's missing attributes from them, as Tiptap does.
 */
export const BLOCK_ATTRS = {
  calloutInfo: {},
  calloutWarning: {},
  badge: { color: 'sky', emoji: '💡' },
  button: { emoji: '🔗', link: '', color: 'blue', alignment: 'left' },
  flipcard: { question: '', answer: '', color: 'blue', alignment: 'center', size: 'medium' },
  blockImage: { blockObject: null, size: { width: 300 }, alignment: 'center' },
  blockPDF: { blockObject: null, size: { width: 720, height: 540 } },
  blockVideo: { blockObject: null },
  blockMathEquation: { math_equation: '', html: '' },
  scenarios: { title: '', scenarios: [], currentScenarioId: '1' },
  blockUser: { user_id: '' },
  blockWebPreview: {
    url: null,
    title: null,
    description: null,
    og_image: null,
    favicon: null,
    og_type: null,
    og_url: null,
    site_name: null,
    alignment: 'left',
    buttonLabel: '',
    showButton: false,
    openInPopup: false,
  },
  embedBlock: { type: null, url: null, width: '100%', height: 500 },
} satisfies Record<string, Record<string, unknown>>
