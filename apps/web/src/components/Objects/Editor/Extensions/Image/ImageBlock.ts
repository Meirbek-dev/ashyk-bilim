import { ReactNodeViewRenderer } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';
import type { CommandProps } from '@tiptap/core';

import ImageBlockComponent from './ImageBlockComponent';

export type ImageBlockAlignment = 'left' | 'center' | 'right';

export interface ImageBlockObject {
  block_uuid: string;
  content: {
    file_id: string;
    file_format: string;
  };
}

export interface ImageBlockAttrs {
  blockObject: ImageBlockObject | null;
  size: { width: number };
  alignment: ImageBlockAlignment;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockImage: {
      insertImageBlock: () => ReturnType;
    };
  }
}

export default Node.create({
  name: 'blockImage',
  group: 'block',

  atom: true,

  addAttributes() {
    return {
      blockObject: {
        default: null,
      },
      size: {
        default: {
          width: 300,
        },
      },
      alignment: {
        default: 'center',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'block-image',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['block-image', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      insertImageBlock:
        () =>
        ({ commands }: CommandProps) =>
          commands.insertContent({ type: this.name }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageBlockComponent);
  },
});
