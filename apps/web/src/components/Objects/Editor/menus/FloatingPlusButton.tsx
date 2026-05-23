'use client';

import { useTiptap } from '@tiptap/react';
import { FloatingMenu } from '@tiptap/react/menus';
import { Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

import { Button } from '@/components/ui/button';
import { openSlashCommand } from '../core/slash-command';

// FloatingPlusButton accesses the editor via useTiptap() rather than receiving
// it as a prop (Requirement 1.1, 1.5). Must be rendered inside a <Tiptap> tree.
export function FloatingPlusButton() {
  const { editor } = useTiptap();
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
      <Button
        type="button"
        onClick={handleClick}
        variant="ghost"
        size="icon"
        className="border-border text-muted-foreground hover:border-primary/30 hover:bg-accent hover:text-foreground size-7 border transition-all"
        aria-label={t('insertBlock')}
        title={t('insertBlockHint')}
      >
        <Plus className="size-4" />
      </Button>
    </FloatingMenu>
  );
}
