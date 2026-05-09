import { Extension } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export interface SlashCommandState {
  active: boolean;
  query: string;
  /** The doc position where `/` was typed (start of current block). */
  from: number;
}

const DEFAULT_SLASH_COMMAND_STATE: SlashCommandState = {
  active: false,
  query: '',
  from: 0,
};

export const slashCommandKey = new PluginKey<{ type: string }>('slashCommand');

export function getSlashCommandState(editor: Editor | null | undefined): SlashCommandState {
  return (
    (editor?.storage as unknown as Record<string, SlashCommandState | undefined>)?.slashCommand ?? {
      ...DEFAULT_SLASH_COMMAND_STATE,
    }
  );
}

export function setSlashCommandState(
  editor: Editor | null | undefined,
  value: SlashCommandState,
  type: 'open' | 'close' | 'update' = 'update',
): void {
  if (!editor) {
    return;
  }

  (editor.storage as unknown as Record<string, unknown>).slashCommand = value;
  editor.view.dispatch(editor.state.tr.setMeta(slashCommandKey, { type }));
}

export function openSlashCommand(editor: Editor | null | undefined, from: number): void {
  setSlashCommandState(editor, { active: true, query: '', from }, 'open');
}

export function closeSlashCommand(editor: Editor | null | undefined): void {
  setSlashCommandState(editor, { ...DEFAULT_SLASH_COMMAND_STATE }, 'close');
}

export function syncSlashCommandQuery(editor: Editor | null | undefined): void {
  if (!editor) {
    return;
  }

  const { selection, doc } = editor.state;
  const nodeText = doc.resolve(selection.from).parent.textContent;
  const slashIndex = nodeText.indexOf('/');

  if (slashIndex === -1) {
    closeSlashCommand(editor);
    return;
  }

  const state = getSlashCommandState(editor);
  setSlashCommandState(
    editor,
    {
      ...state,
      active: true,
      query: nodeText.slice(slashIndex + 1),
    },
    'update',
  );
}

export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addStorage(): SlashCommandState {
    return { ...DEFAULT_SLASH_COMMAND_STATE };
  },

  addProseMirrorPlugins() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const ext = this;

    return [
      new Plugin({
        key: slashCommandKey,
        props: {
          handleKeyDown(_view, event) {
            const storage = getSlashCommandState(ext.editor);
            if (!storage.active) return false;
            if (event.key === 'Escape') {
              closeSlashCommand(ext.editor);
              return true;
            }
            // Arrow keys / Enter are handled by the React menu itself
            return false;
          },

          handleTextInput(view, from, _to, text) {
            const storage = getSlashCommandState(ext.editor);
            const { state } = view;
            const $from = state.doc.resolve(from);
            const isAtEmptyBlockStart = $from.parentOffset === 0 && $from.parent.textContent === '';

            if (text === '/' && isAtEmptyBlockStart) {
              // Let the character be inserted first (~1 tick), then open the menu
              setTimeout(() => {
                openSlashCommand(ext.editor, from);
              }, 0);
              return false;
            }

            if (storage.active) {
              setTimeout(() => {
                syncSlashCommandQuery(ext.editor);
              }, 0);
            }

            return false;
          },
        },
      }),
    ];
  },
});
