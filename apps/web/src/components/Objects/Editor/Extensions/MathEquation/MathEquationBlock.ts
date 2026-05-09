import { Node, mergeAttributes } from '@tiptap/core';
import type { CommandProps } from '@tiptap/core';

import MathEquationBlockComponent from './MathEquationBlockComponent';
import { nodeView } from '@components/Objects/Editor/core';

export interface MathEquationBlockAttrs {
  math_equation: string;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockMathEquation: {
      insertMathEquation: () => ReturnType;
    };
  }
}

export default Node.create({
  name: 'blockMathEquation',
  group: 'block',

  atom: true,

  addAttributes() {
    return {
      math_equation: {
        default: '',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'block-math-equation',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['block-math-equation', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      insertMathEquation:
        () =>
        ({ commands }: CommandProps) =>
          commands.insertContent({ type: this.name }),
    };
  },

  addNodeView() {
    return nodeView(MathEquationBlockComponent);
  },
});
