import { ReactNodeViewRenderer } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';
import type { CommandProps } from '@tiptap/core';
import FlipcardExtension from './FlipcardExtension';

export type FlipcardAlignment = 'left' | 'center' | 'right';
export type FlipcardSize = 'small' | 'medium' | 'large';

export interface FlipcardAttrs {
  question: string;
  answer: string;
  color: string;
  alignment: FlipcardAlignment;
  size: FlipcardSize;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    flipcard: {
      insertFlipcard: () => ReturnType;
    };
  }
}

export default Node.create({
  name: 'flipcard',
  group: 'block',
  // Dragging interactive NodeViews often causes selection/hover flicker.
  // Keep this false; if dragging is needed, add a dedicated drag handle instead.
  draggable: false,
  // Avoid node selection flicker on hover/mousemove
  selectable: false,
  content: 'text*',

  addAttributes() {
    return {
      question: {
        default: '',
      },
      answer: {
        default: '',
      },
      color: {
        default: 'blue',
      },
      alignment: {
        default: 'center',
      },
      size: {
        default: 'medium',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'flipcard-block',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['flipcard-block', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      insertFlipcard:
        () =>
        ({ commands }: CommandProps) =>
          commands.insertContent({ type: this.name }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(FlipcardExtension);
  },
});
