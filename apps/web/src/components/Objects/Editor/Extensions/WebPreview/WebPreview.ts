import { Node, mergeAttributes } from '@tiptap/core'
import type { CommandProps } from '@tiptap/core'

import WebPreviewComponent from './WebPreviewComponent'
import { nodeView } from '@components/Objects/Editor/core/nodeview-types'

export type WebPreviewAlignment = 'left' | 'center' | 'right'

export interface WebPreviewAttrs {
  url: string | null
  title: string | null
  description: string | null
  og_image: string | null
  favicon: string | null
  og_type: string | null
  og_url: string | null
  /** `og:site_name` from the server preview (`GET utils/link-preview`). */
  site_name: string | null
  alignment: WebPreviewAlignment
  buttonLabel: string
  showButton: boolean
  openInPopup: boolean
}

export interface WebPreviewStorage {
  /** The URL dialog is open; the node is inserted only once it confirms (BUG-107). */
  insertOpen: boolean
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockWebPreview: {
      /** Without attrs: opens the URL dialog (`WebPreviewInsertDialog`); with a `url`: inserts the block. */
      insertWebPreview: (attrs?: Partial<WebPreviewAttrs> & { url: string }) => ReturnType
      closeWebPreviewDialog: () => ReturnType
    }
  }
  interface Storage {
    blockWebPreview: WebPreviewStorage
  }
}

const WebPreview = Node.create({
  name: 'blockWebPreview',
  group: 'block',
  atom: true,

  addStorage(): WebPreviewStorage {
    return { insertOpen: false }
  },

  addAttributes() {
    return {
      url: { default: null },
      title: { default: null },
      description: { default: null },
      og_image: { default: null },
      favicon: { default: null },
      og_type: { default: null },
      og_url: { default: null },
      site_name: { default: null },
      alignment: { default: 'left' },
      buttonLabel: { default: '' },
      showButton: { default: false },
      openInPopup: { default: false },
    }
  },

  parseHTML() {
    return [{ tag: 'web-preview' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['web-preview', mergeAttributes(HTMLAttributes)]
  },

  addCommands() {
    return {
      insertWebPreview:
        attrs =>
        ({ commands, editor }: CommandProps) => {
          if (attrs) return commands.insertContent({ type: this.name, attrs })
          // A doc-neutral transaction: `useEditorState` re-reads the storage, autosave sees no change.
          editor.storage.blockWebPreview.insertOpen = true
          return true
        },
      closeWebPreviewDialog:
        () =>
        ({ editor }: CommandProps) => {
          editor.storage.blockWebPreview.insertOpen = false
          return true
        },
    }
  },

  addNodeView() {
    return nodeView(WebPreviewComponent)
  },
})

export default WebPreview
