import { mergeAttributes, Node } from '@tiptap/core'

import { BLOCK_ATTRS } from './attrs'

/** The one embed node (D-01). Its HTML form keeps every attribute in `data-embed-*` (copy and paste). */
export const EmbedBlock = Node.create({
  name: 'embedBlock',
  group: 'block',
  atom: true,
  defining: true,
  isolating: true,
  draggable: true,

  addAttributes() {
    return {
      type: {
        default: null,
        parseHTML: element => element.getAttribute('data-embed-type'),
        renderHTML: attributes => (attributes['type'] ? { 'data-embed-type': attributes['type'] } : {}),
      },
      url: {
        default: null,
        parseHTML: element => element.getAttribute('data-embed-url'),
        renderHTML: attributes => (attributes['url'] ? { 'data-embed-url': attributes['url'] } : {}),
      },
      width: {
        default: BLOCK_ATTRS.embedBlock.width,
        parseHTML: element => element.getAttribute('data-embed-width') ?? BLOCK_ATTRS.embedBlock.width,
        renderHTML: attributes => ({ 'data-embed-width': attributes['width'] }),
      },
      height: {
        default: BLOCK_ATTRS.embedBlock.height,
        parseHTML: element => {
          const parsed = Number(element.getAttribute('data-embed-height') ?? Number.NaN)
          return Number.isFinite(parsed) ? parsed : BLOCK_ATTRS.embedBlock.height
        },
        renderHTML: attributes => ({ 'data-embed-height': String(attributes['height']) }),
      },
    }
  },

  parseHTML: () => [{ tag: 'div[data-embed-block]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-embed-block': '' })],
})
