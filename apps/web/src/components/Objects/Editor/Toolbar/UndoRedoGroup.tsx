'use client';

import type { Editor } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import { Undo2, Redo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface UndoRedoGroupProps {
  editor: Editor;
  canUndo: boolean;
  canRedo: boolean;
}

export function UndoRedoGroup({ editor, canUndo, canRedo }: UndoRedoGroupProps) {
  const t = useTranslations('DashPage.Editor.Toolbar');

  return (
    <div className="flex items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon-sm"
        type="button"
        disabled={!canUndo}
        onClick={() => editor.chain().focus().undo().run()}
        aria-label={t('undo')}
        title={`${t('undo')} (Ctrl+Z)`}
      >
        <Undo2 />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        type="button"
        disabled={!canRedo}
        onClick={() => editor.chain().focus().redo().run()}
        aria-label={t('redo')}
        title={`${t('redo')} (Ctrl+Y)`}
      >
        <Redo2 />
      </Button>
    </div>
  );
}
