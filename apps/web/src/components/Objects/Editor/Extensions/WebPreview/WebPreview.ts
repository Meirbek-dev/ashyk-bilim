import { Node, mergeAttributes } from '@tiptap/core';
import type { CommandProps } from '@tiptap/core';

import WebPreviewComponent from './WebPreviewComponent';
import { nodeView } from '@components/Objects/Editor/core';

export type WebPreviewAlignment = 'left' | 'center' | 'right';

export interface WebPreviewAttrs {
  url: string | null;
  title: string | null;
  description: string | null;
  og_image: string | null;
  favicon: string | null;
  og_type: string | null;
  og_url: string | null;
  alignment: WebPreviewAlignment;
  buttonLabel: string;
  showButton: boolean;
  openInPopup: boolean;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockWebPreview: {
      insertWebPreview: () => ReturnType;
    };
  }
}

const WebPreview = Node.create({
  name: 'blockWebPreview',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      url: { default: null },
      title: { default: null },
      description: { default: null },
      og_image: { default: null },
      favicon: { default: null },
      og_type: { default: null },
      og_url: { default: null },
      alignment: { default: 'left' },
      buttonLabel: { default: '' },
      showButton: { default: false },
      openInPopup: { default: false },
    };
  },

  parseHTML() {
    return [{ tag: 'web-preview' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['web-preview', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      insertWebPreview:
        () =>
        ({ commands }: CommandProps) =>
          commands.insertContent({ type: this.name }),
    };
  },

  addNodeView() {
    return nodeView(WebPreviewComponent);
  },
});

export default WebPreview;
