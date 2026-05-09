import { ReactNodeViewRenderer } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';
import type { CommandProps } from '@tiptap/core';

import WarningCalloutComponent from './WarningCalloutComponent';

export interface WarningCalloutAttrs {
  dismissible?: boolean;
  variant?: 'default' | 'filled' | 'outlined';
  size?: 'sm' | 'md' | 'lg';
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    calloutWarning: {
      insertWarningCallout: () => ReturnType;
    };
  }
}

export default Node.create({
  name: 'calloutWarning',
  group: 'block',
  draggable: true,
  content: 'block+',

  parseHTML() {
    return [
      {
        tag: 'callout-warning',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['callout-warning', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      insertWarningCallout:
        () =>
        ({ commands }: CommandProps) =>
          commands.insertContent({
            type: this.name,
            content: [{ type: 'paragraph' }],
          }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(WarningCalloutComponent, {
      contentDOMElementTag: 'div',
    });
  },
});
