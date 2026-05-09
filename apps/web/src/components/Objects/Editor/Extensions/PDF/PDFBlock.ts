import { Node, mergeAttributes } from '@tiptap/core';
import type { CommandProps } from '@tiptap/core';

import PDFBlockComponent from './PDFBlockComponent';
import { nodeView } from '@components/Objects/Editor/core';

export interface PdfBlockObject {
  block_uuid: string;
  content: {
    file_id: string;
    file_format: string;
  };
}

export interface PdfBlockAttrs {
  blockObject: PdfBlockObject | null;
  size: {
    width: number;
    height: number;
  };
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockPDF: {
      insertPDFBlock: () => ReturnType;
    };
  }
}

export default Node.create({
  name: 'blockPDF',
  group: 'block',

  atom: true,

  addAttributes() {
    return {
      blockObject: {
        default: null,
      },
      size: {
        default: {
          width: 720,
          height: 540,
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'block-pdf',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['block-pdf', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      insertPDFBlock:
        () =>
        ({ commands }: CommandProps) =>
          commands.insertContent({ type: this.name }),
    };
  },

  addNodeView() {
    return nodeView(PDFBlockComponent);
  },
});
