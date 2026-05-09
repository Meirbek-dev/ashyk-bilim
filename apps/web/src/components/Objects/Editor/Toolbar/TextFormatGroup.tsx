'use client';

import type { Editor } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import { Bold, Italic, Strikethrough } from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';

interface TextFormatGroupProps {
  editor: Editor;
  isBold: boolean;
  isItalic: boolean;
  isStrike: boolean;
}

export function TextFormatGroup({ editor, isBold, isItalic, isStrike }: TextFormatGroupProps) {
  const t = useTranslations('DashPage.Editor.Toolbar');

  return (
    <div className="flex items-center gap-0.5">
      <Toggle
        size="sm"
        pressed={isBold}
        onPressedChange={() => editor.chain().focus().toggleBold().run()}
        aria-label={t('bold')}
        title={`${t('bold')} (Ctrl+B)`}
      >
        <Bold />
      </Toggle>
      <Toggle
        size="sm"
        pressed={isItalic}
        onPressedChange={() => editor.chain().focus().toggleItalic().run()}
        aria-label={t('italic')}
        title={`${t('italic')} (Ctrl+I)`}
      >
        <Italic />
      </Toggle>
      <Toggle
        size="sm"
        pressed={isStrike}
        onPressedChange={() => editor.chain().focus().toggleStrike().run()}
        aria-label={t('strike')}
        title={`${t('strike')} (Ctrl+Shift+S)`}
      >
        <Strikethrough />
      </Toggle>
    </div>
  );
}
