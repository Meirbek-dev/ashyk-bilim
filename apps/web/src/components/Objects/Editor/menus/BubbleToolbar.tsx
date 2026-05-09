'use client';

import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { useTranslations } from 'next-intl';
import { Bold, Code, Italic, Link2, Strikethrough, ChevronDown } from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCallback, useState } from 'react';
import LinkInputTooltip from '../Toolbar/LinkInputTooltip';

interface BubbleToolbarProps {
  editor: Editor;
}

export function BubbleToolbar({ editor }: BubbleToolbarProps) {
  const t = useTranslations('DashPage.Editor.Toolbar');
  const [showLinkInput, setShowLinkInput] = useState(false);

  const shouldShow = useCallback(() => {
    // Don't show for empty selections, images, or node selections
    if (editor.state.selection.empty) return false;
    if (editor.isActive('image')) return false;
    return true;
  }, [editor]);

  const handleLinkSave = (url: string) => {
    editor.chain().focus().setLink({ href: url, target: '_blank', rel: 'noopener noreferrer' }).run();
    setShowLinkInput(false);
  };

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={shouldShow}
      className="border-border bg-popover flex items-center gap-0.5 rounded-lg border px-1 py-0.5 shadow-md"
    >
      {/* Turn-into dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="sm"
              type="button"
              className="h-7 gap-0.5 px-1.5 text-xs"
            >
              <span className="font-medium">{getActiveBlockLabel(editor, t)}</span>
              <ChevronDown className="size-3 opacity-60" />
            </Button>
          }
        />
        <DropdownMenuContent
          side="bottom"
          align="start"
        >
          <DropdownMenuItem onClick={() => editor.chain().focus().setParagraph().run()}>
            {t('paragraph')}
          </DropdownMenuItem>
          {([1, 2, 3] as const).map((level) => (
            <DropdownMenuItem
              key={level}
              onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
            >
              <span className="font-semibold">{t('headingLevel', { level })}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onClick={() => editor.chain().focus().toggleBulletList().run()}>
            {t('listOptions.bulletList')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            {t('listOptions.orderedList')}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
            {t('codeBlock')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator
        orientation="vertical"
        className="mx-0.5 h-4"
      />

      {/* Inline marks */}
      <Toggle
        size="sm"
        pressed={editor.isActive('bold')}
        onPressedChange={() => editor.chain().focus().toggleBold().run()}
        aria-label={t('bold')}
        className="h-7 w-7"
      >
        <Bold className="size-3.5" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive('italic')}
        onPressedChange={() => editor.chain().focus().toggleItalic().run()}
        aria-label={t('italic')}
        className="h-7 w-7"
      >
        <Italic className="size-3.5" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive('strike')}
        onPressedChange={() => editor.chain().focus().toggleStrike().run()}
        aria-label={t('strike')}
        className="h-7 w-7"
      >
        <Strikethrough className="size-3.5" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive('code')}
        onPressedChange={() => editor.chain().focus().toggleCode().run()}
        aria-label={t('codeInline')}
        className="h-7 w-7"
      >
        <Code className="size-3.5" />
      </Toggle>

      <Separator
        orientation="vertical"
        className="mx-0.5 h-4"
      />

      {/* Link */}
      <div className="relative">
        <Toggle
          size="sm"
          pressed={editor.isActive('link')}
          onPressedChange={(pressed) => {
            if (!pressed && editor.isActive('link')) {
              editor.chain().focus().unsetLink().run();
              setShowLinkInput(false);
              return;
            }
            setShowLinkInput(true);
          }}
          aria-label={t('link')}
          className="h-7 w-7"
        >
          <Link2 className="size-3.5" />
        </Toggle>
        {showLinkInput ? (
          <LinkInputTooltip
            onSave={handleLinkSave}
            onCancel={() => setShowLinkInput(false)}
            currentUrl={editor.getAttributes('link').href ?? ''}
          />
        ) : null}
      </div>
    </BubbleMenu>
  );
}

function getActiveBlockLabel(editor: Editor, t: ReturnType<typeof useTranslations>): string {
  if (editor.isActive('heading', { level: 1 })) return t('headingLevel', { level: 1 });
  if (editor.isActive('heading', { level: 2 })) return t('headingLevel', { level: 2 });
  if (editor.isActive('heading', { level: 3 })) return t('headingLevel', { level: 3 });
  if (editor.isActive('bulletList')) return t('listOptions.bulletList');
  if (editor.isActive('orderedList')) return t('listOptions.orderedList');
  if (editor.isActive('codeBlock')) return t('codeBlock');
  return t('paragraph');
}
