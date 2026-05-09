import { ReactNodeViewRenderer } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';
import type { CommandProps } from '@tiptap/core';

import VideoBlockComponent from './VideoBlockComponent';

export interface VideoBlockObject {
  block_uuid: string;
  content: {
    file_id: string;
    file_format: string;
  };
  size?: 'small' | 'medium' | 'large' | 'full';
}

export interface VideoBlockAttrs {
  blockObject: VideoBlockObject | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockVideo: {
      insertVideoBlock: () => ReturnType;
    };
  }
}

export default Node.create({
  name: 'blockVideo',
  group: 'block',
  atom: true,

  addAttributes() {
    return {
      blockObject: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'block-video',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['block-video', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      insertVideoBlock:
        () =>
        ({ commands }: CommandProps) =>
          commands.insertContent({ type: this.name }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(VideoBlockComponent);
  },
});
