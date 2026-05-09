'use client';

import type { Editor } from '@tiptap/react';
import { FloatingMenu } from '@tiptap/react/menus';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';
import { openSlashCommand } from '../core/slash-command';

interface FloatingPlusButtonProps {
  editor: Editor;
}

export function FloatingPlusButton({ editor }: FloatingPlusButtonProps) {
  const t = useTranslations('DashPage.Editor.Toolbar');

  const shouldShow = useCallback(() => {
    if (editor.isEmpty) {
      return false;
    }

    // Show only when cursor is on an empty paragraph
    const { selection } = editor.state;
    const { $from } = selection;
    const node = $from.parent;

    return node.type.name === 'paragraph' && node.content.size === 0 && selection.empty;
  }, [editor]);

  const handleClick = () => {
    const { from } = editor.state.selection;
    editor.chain().focus().insertContent('/').run();
    openSlashCommand(editor, from);
  };

  return (
    <FloatingMenu
      editor={editor}
      shouldShow={shouldShow}
      className="flex items-center"
    >
      <button
        type="button"
        onClick={handleClick}
        className="border-border text-muted-foreground hover:border-primary/30 hover:bg-accent hover:text-foreground flex size-7 items-center justify-center rounded-md border transition-all"
        aria-label={t('insertBlock')}
        title={t('insertBlockHint')}
      >
        <Plus className="size-4" />
      </button>
    </FloatingMenu>
  );
}
