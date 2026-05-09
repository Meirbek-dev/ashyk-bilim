import { ReactNodeViewRenderer } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';
import type { CommandProps } from '@tiptap/core';

import InfoCalloutComponent from './InfoCalloutComponent';

export interface InfoCalloutAttrs {
  dismissible?: boolean;
  variant?: 'default' | 'filled' | 'outlined';
  size?: 'sm' | 'md' | 'lg';
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    calloutInfo: {
      insertInfoCallout: () => ReturnType;
    };
  }
}

export default Node.create({
  name: 'calloutInfo',
  group: 'block',
  draggable: true,
  content: 'block+',

  parseHTML() {
    return [
      {
        tag: 'callout-info',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['callout-info', mergeAttributes(HTMLAttributes), 0];
  },

  addCommands() {
    return {
      insertInfoCallout:
        () =>
        ({ commands }: CommandProps) =>
          commands.insertContent({
            type: this.name,
            content: [{ type: 'paragraph' }],
          }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(InfoCalloutComponent, {
      contentDOMElementTag: 'div',
    });
  },
});
