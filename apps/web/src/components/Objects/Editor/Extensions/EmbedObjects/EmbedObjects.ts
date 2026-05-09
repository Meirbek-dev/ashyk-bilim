import { Node, mergeAttributes } from '@tiptap/core';
import type { CommandProps } from '@tiptap/core';

import EmbedObjectsComponent from './EmbedObjectsComponent';
import { nodeView } from '@components/Objects/Editor/core';

export type EmbedObjectAlignment = 'left' | 'center';

export interface EmbedObjectAttrs {
  embedUrl: string | null;
  embedCode: string | null;
  embedType: string | null;
  embedHeight: number;
  embedWidth: string;
  alignment: EmbedObjectAlignment;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockEmbed: {
      insertEmbedObject: () => ReturnType;
    };
  }
}

export default Node.create({
  name: 'blockEmbed',
  group: 'block',

  addAttributes() {
    return {
      embedUrl: {
        default: null,
      },
      embedCode: {
        default: null,
      },
      embedType: {
        default: null,
      },
      embedHeight: {
        default: 300,
      },
      embedWidth: {
        default: '100%',
      },
      alignment: {
        default: 'left',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'block-embed',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['block-embed', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      insertEmbedObject:
        () =>
        ({ commands }: CommandProps) =>
          commands.insertContent({ type: this.name }),
    };
  },

  addNodeView() {
    return nodeView(EmbedObjectsComponent);
  },
});
