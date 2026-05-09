import { Node, mergeAttributes } from '@tiptap/core';
import type { CommandProps } from '@tiptap/core';

import BadgesExtension from './BadgesExtension';
import { nodeView } from '@components/Objects/Editor/core';

export interface BadgeAttrs {
  color: string;
  emoji: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    badge: {
      insertBadge: () => ReturnType;
    };
  }
}

export default Node.create({
  name: 'badge',
  group: 'block',
  draggable: true,
  content: 'block+',

  addAttributes() {
    return {
      color: {
        default: 'sky',
      },
      emoji: {
        default: '💡',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'badge',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['badge', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      insertBadge:
        () =>
        ({ commands }: CommandProps) =>
          commands.insertContent({
            type: this.name,
            content: [{ type: 'paragraph' }],
          }),
    };
  },

  addNodeView() {
    return nodeView(BadgesExtension, {
      contentDOMElementTag: 'div',
    });
  },
});
