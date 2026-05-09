'use client';

import type { Editor } from '@tiptap/react';
import { useEditorState } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useTheme } from '@/components/providers/theme-provider';
import platformLogoDark from '@public/platform_logo.svg';
import platformLogoLight from '@public/platform_logo_light.svg';
import { Separator } from '@/components/ui/separator';

import { UndoRedoGroup } from './UndoRedoGroup';
import { TextFormatGroup } from './TextFormatGroup';
import { HeadingDropdown } from './HeadingDropdown';
import { CodeBlockLanguageDropdown } from './CodeBlockLanguageDropdown';
import { LinkToggle } from './LinkToggle';
import { ListDropdown } from './ListDropdown';
import { TableDropdown } from './TableDropdown';
import { InsertButtons } from './InsertButtons';

const ToolbarSeparator = () => (
  <Separator
    orientation="vertical"
    className="mx-1 h-4 self-center"
  />
);

interface EditorToolbarProps {
  editor: Editor | null;
  onAIToggle: () => void;
}

export function EditorToolbar({ editor, onAIToggle }: EditorToolbarProps) {
  const t = useTranslations('DashPage.Editor.Toolbar');
  const { resolvedTheme } = useTheme();
  const logoSrc = resolvedTheme === 'dark' ? platformLogoDark : platformLogoLight;

  const editorState = useEditorState({
    editor,
    selector: (ctx) => ({
      isBold: ctx.editor?.isActive('bold') ?? false,
      isItalic: ctx.editor?.isActive('italic') ?? false,
      isStrike: ctx.editor?.isActive('strike') ?? false,
      isBulletList: ctx.editor?.isActive('bulletList') ?? false,
      isCodeBlock: ctx.editor?.isActive('codeBlock') ?? false,
      isOrderedList: ctx.editor?.isActive('orderedList') ?? false,
      isLink: ctx.editor?.isActive('link') ?? false,
      headingLevel: ctx.editor?.isActive('heading', { level: 1 })
        ? 1
        : ctx.editor?.isActive('heading', { level: 2 })
          ? 2
          : ctx.editor?.isActive('heading', { level: 3 })
            ? 3
            : ctx.editor?.isActive('heading', { level: 4 })
              ? 4
              : ctx.editor?.isActive('heading', { level: 5 })
                ? 5
                : ctx.editor?.isActive('heading', { level: 6 })
                  ? 6
                  : 0,
      canUndo: ctx.editor?.can().undo() ?? false,
      canRedo: ctx.editor?.can().redo() ?? false,
      codeBlockLanguage: ctx.editor?.getAttributes('codeBlock').language ?? null,
      linkHref: ctx.editor?.getAttributes('link').href ?? '',
    }),
  });

  if (!editor || !editorState) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-0.5 py-1.5"
      role="toolbar"
      aria-label={t('editorToolbar')}
    >
      <UndoRedoGroup
        editor={editor}
        canUndo={editorState.canUndo}
        canRedo={editorState.canRedo}
      />
      <ToolbarSeparator />
      <TextFormatGroup
        editor={editor}
        isBold={editorState.isBold}
        isItalic={editorState.isItalic}
        isStrike={editorState.isStrike}
      />
      <ToolbarSeparator />
      <HeadingDropdown
        editor={editor}
        headingLevel={editorState.headingLevel}
      />
      <ToolbarSeparator />
      <LinkToggle
        editor={editor}
        isLink={editorState.isLink}
        linkHref={editorState.linkHref}
      />
      <ToolbarSeparator />
      <ListDropdown
        editor={editor}
        isBulletList={editorState.isBulletList}
        isOrderedList={editorState.isOrderedList}
      />
      {editorState.isCodeBlock ? (
        <CodeBlockLanguageDropdown
          editor={editor}
          language={editorState.codeBlockLanguage}
        />
      ) : null}
      <TableDropdown editor={editor} />
      <ToolbarSeparator />
      <InsertButtons editor={editor} />
      <div className="ml-auto flex shrink-0 items-center">
        <button
          type="button"
          onClick={onAIToggle}
          className="border-border bg-foreground text-background hover:bg-foreground/90 dark:hover:bg-foreground/90 flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors"
          title={t('aiEditor')}
          aria-label={t('aiEditor')}
        >
          <Image
            width={18}
            height={18}
            src={logoSrc}
            alt="Ashyk Bilim logo"
            style={{ height: 'auto' }}
          />
          <span>{t('aiEditor')}</span>
        </button>
      </div>
    </div>
  );
}
