import Heading from '@tiptap/extension-heading';
import { Plugin, PluginKey } from '@tiptap/pm/state';

import { collectHeadingIdUpdates } from './heading-ids';

export const HeadingWithIds = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute('id'),
        renderHTML: (attributes) => {
          if (!attributes.id) {
            return {};
          }

          return { id: attributes.id };
        },
      },
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('heading-with-ids'),
        appendTransaction: (_transactions, _oldState, newState) => {
          const updates = collectHeadingIdUpdates(newState.doc);

          if (updates.length === 0) {
            return null;
          }

          const { tr } = newState;

          for (const update of updates) {
            const node = newState.doc.nodeAt(update.pos);
            if (!node) {
              continue;
            }

            tr.setNodeMarkup(update.pos, undefined, {
              ...node.attrs,
              id: update.id,
            });
          }

          tr.setMeta('heading-with-ids', true);
          return tr;
        },
      }),
    ];
  },
});
