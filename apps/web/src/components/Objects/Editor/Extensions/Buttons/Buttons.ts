import { Node, mergeAttributes } from '@tiptap/core';
import type { CommandProps } from '@tiptap/core';

import ButtonsExtension from './ButtonsExtension';
import { nodeView } from '@components/Objects/Editor/core';

export type ButtonAlignment = 'left' | 'center' | 'right';

export interface ButtonAttrs {
  emoji: string;
  link: string;
  color: string;
  alignment: ButtonAlignment;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    button: {
      insertButton: () => ReturnType;
    };
  }
}

export default Node.create({
  name: 'button',
  group: 'block',
  draggable: true,
  content: 'text*',

  addAttributes() {
    return {
      emoji: {
        default: '🔗',
      },
      link: {
        default: '',
      },
      color: {
        default: 'blue',
      },
      alignment: {
        default: 'left',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'button-block',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['button-block', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      insertButton:
        () =>
        ({ commands }: CommandProps) =>
          commands.insertContent({ type: this.name }),
    };
  },

  addNodeView() {
    return nodeView(ButtonsExtension);
  },
});
