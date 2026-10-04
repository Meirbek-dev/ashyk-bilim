import { mergeAttributes, Node } from '@tiptap/core'

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
        default: '100%',
        parseHTML: element => element.getAttribute('data-embed-width') ?? '100%',
        renderHTML: attributes => ({ 'data-embed-width': attributes['width'] }),
      },
      height: {
        default: 500,
        parseHTML: element => {
          const parsed = Number(element.getAttribute('data-embed-height') ?? Number.NaN)
          return Number.isFinite(parsed) ? parsed : 500
        },
        renderHTML: attributes => ({ 'data-embed-height': String(attributes['height']) }),
      },
    }
  },

  parseHTML: () => [{ tag: 'div[data-embed-block]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', mergeAttributes(HTMLAttributes, { 'data-embed-block': '' })],
})
