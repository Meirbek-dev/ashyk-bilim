'use client';

import { useTiptap, useTiptapState } from '@tiptap/react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import { useRef } from 'react';
import { Globe2 } from 'lucide-react';
import { useTheme } from '@/components/providers/theme-provider';
import platformLogoDark from '@public/platform_logo.svg';
import platformLogoLight from '@public/platform_logo_light.svg';
import { Separator } from '@/components/ui/separator';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useEmbedPanelStore } from './EmbedPanel/EmbedPanelStore';

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

/**
 * The `useTiptapState` selector for `EditorToolbar`.
 *
 * Exported so it can be tested in isolation (Property 9).
 * All returned values are primitives (boolean, number, string, or null) so
 * that `useTiptapState`'s default deep-equality check correctly prevents
 * re-renders when unrelated editor state changes (Requirements 1.4, 2.2).
 */
export interface ToolbarStateSnap {
  editor: {
    isActive: (name: string, attrs?: Record<string, unknown>) => boolean;
    can: () => { undo: () => boolean; redo: () => boolean };
    getAttributes: (name: string) => Record<string, unknown>;
  };
}

export function selectToolbarState(snap: ToolbarStateSnap) {
  return {
    isBold: snap.editor.isActive('bold'),
    isItalic: snap.editor.isActive('italic'),
    isStrike: snap.editor.isActive('strike'),
    isBulletList: snap.editor.isActive('bulletList'),
    isOrderedList: snap.editor.isActive('orderedList'),
    isCodeBlock: snap.editor.isActive('codeBlock'),
    isLink: snap.editor.isActive('link'),
    headingLevel: snap.editor.isActive('heading', { level: 1 })
      ? 1
      : snap.editor.isActive('heading', { level: 2 })
        ? 2
        : snap.editor.isActive('heading', { level: 3 })
          ? 3
          : snap.editor.isActive('heading', { level: 4 })
            ? 4
            : snap.editor.isActive('heading', { level: 5 })
              ? 5
              : snap.editor.isActive('heading', { level: 6 })
                ? 6
                : 0,
    canUndo: snap.editor.can().undo(),
    canRedo: snap.editor.can().redo(),
    codeBlockLanguage: (snap.editor.getAttributes('codeBlock').language as string) ?? null,
    linkHref: (snap.editor.getAttributes('link').href as string) ?? '',
  };
}

interface EditorToolbarProps {
  onAIToggle: () => void;
}

export function EditorToolbar({ onAIToggle }: EditorToolbarProps) {
  const t = useTranslations('DashPage.Editor.Toolbar');
  const tCommon = useTranslations('Common');
  const { resolvedTheme } = useTheme();
  const logoSrc = resolvedTheme === 'dark' ? platformLogoDark : platformLogoLight;

  // Access the editor instance from the <Tiptap> context (Requirement 1.1).
  const { editor } = useTiptap();

  // Subscribe to only the primitive state slices the toolbar needs.
  // useTiptapState deep-compares by default, so the toolbar only re-renders
  // when these specific values change (Requirements 1.4, 2.2, 2.4).
  const toolbarState = useTiptapState(selectToolbarState);

  // Ref for the Embed button — passed to EmbedPanelStore so focus can be
  // returned to the trigger when the panel closes (Requirement 12.6).
  const embedTriggerRef = useRef<HTMLButtonElement>(null);
  const openEmbedPanel = useEmbedPanelStore((s) => s.open);

  // Only render the toolbar once the editor is ready (Requirement 1.4).
  if (!editor || !toolbarState) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-0.5 py-1.5"
      role="toolbar"
      aria-label={t('editorToolbar')}
    >
      <UndoRedoGroup
        editor={editor}
        canUndo={toolbarState.canUndo}
        canRedo={toolbarState.canRedo}
      />
      <ToolbarSeparator />
      <TextFormatGroup
        editor={editor}
        isBold={toolbarState.isBold}
        isItalic={toolbarState.isItalic}
        isStrike={toolbarState.isStrike}
      />
      <ToolbarSeparator />
      <HeadingDropdown
        editor={editor}
        headingLevel={toolbarState.headingLevel}
      />
      <ToolbarSeparator />
      <LinkToggle
        editor={editor}
        isLink={toolbarState.isLink}
        linkHref={toolbarState.linkHref}
      />
      <ToolbarSeparator />
      <ListDropdown
        editor={editor}
        isBulletList={toolbarState.isBulletList}
        isOrderedList={toolbarState.isOrderedList}
      />
      {toolbarState.isCodeBlock ? (
        <CodeBlockLanguageDropdown
          editor={editor}
          language={toolbarState.codeBlockLanguage}
        />
      ) : null}
      <TableDropdown editor={editor} />
      <ToolbarSeparator />
      <InsertButtons editor={editor} />

      {/* Embed button — media insert group (Requirements 3.1, 11.4) */}
      <TooltipProvider delay={150}>
        <div
          className="border-border/70 bg-muted/30 flex items-center gap-1 rounded-xl border ml-3 px-1 py-1"
          role="group"
          aria-label={t('insertGroups.media')}
        >
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  ref={embedTriggerRef}
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('externalObject')}
                  title={t('externalObject')}
                  onClick={() => openEmbedPanel(embedTriggerRef)}
                >
                  <Globe2 className="size-4" />
                </Button>
              }
            />
            <TooltipContent side="bottom">
              <p className="font-medium">{t('externalObject')}</p>
            </TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>

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
            alt={tCommon('platformLogoAlt')}
            style={{ height: 'auto' }}
          />
          <span>{t('aiEditor')}</span>
        </button>
      </div>
    </div>
  );
}
