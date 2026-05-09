import { Node, mergeAttributes } from '@tiptap/core';
import type { CommandProps } from '@tiptap/core';

import UserBlockComponent from './UserBlockComponent';
import { nodeView } from '@components/Objects/Editor/core';

export interface UserBlockAttrs {
  user_id: string | number | null;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockUser: {
      insertUserBlock: () => ReturnType;
    };
  }
}

export default Node.create({
  name: 'blockUser',
  group: 'block',

  atom: true,

  addAttributes() {
    return {
      user_id: {
        default: '',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'block-user',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['block-user', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      insertUserBlock:
        () =>
        ({ commands }: CommandProps) =>
          commands.insertContent({ type: this.name }),
    };
  },

  addNodeView() {
    return nodeView(UserBlockComponent);
  },
});
