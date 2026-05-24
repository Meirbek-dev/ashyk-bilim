'use client';

import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TableRow } from '@tiptap/extension-table-row';
import { Markdown } from 'tiptap-markdown';
import {
  Bold,
  Code,
  Eye,
  Heading2,
  Italic,
  LinkIcon,
  List,
  ListOrdered,
  Redo2,
  Rows3,
  SplitSquareHorizontal,
  TextCursorInput,
  Undo2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { cn } from '@/lib/utils';
import { MarkdownContent } from '../renderer/MarkdownContent';
import type { MarkdownEditorPreset, MarkdownEditorSaveState } from '../presets/presets';
import { getMarkdownPreset } from '../presets/presets';
import { normalizeMarkdown, isMarkdownStructurallyEmpty } from '../utils/markdown-sanitize';
import { getHighestMarkdownIssueSeverity, validateMarkdownContent } from '../hooks/useMarkdownValidation';

interface MarkdownEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  preset?: MarkdownEditorPreset;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  minHeight?: number;
  maxHeight?: number;
  autoFocus?: boolean;
  saveState?: MarkdownEditorSaveState;
  required?: boolean;
  onBlur?: () => void;
}

type ViewMode = 'write' | 'split' | 'preview';

export function MarkdownEditor({
  value,
  onChange,
  preset = 'questionPrompt',
  disabled = false,
  placeholder,
  className,
  minHeight,
  maxHeight,
  autoFocus = false,
  saveState = 'idle',
  required = false,
  onBlur,
}: MarkdownEditorProps) {
  const config = getMarkdownPreset(preset);
  const [viewMode, setViewMode] = useState<ViewMode>('write');
  const [lastInsertedSnippet, setLastInsertedSnippet] = useState('');
  const normalizedValue = normalizeMarkdown(value ?? '');

  const issues = useMemo(
    () => validateMarkdownContent(normalizedValue, preset, { required }),
    [normalizedValue, preset, required],
  );
  const severity = getHighestMarkdownIssueSeverity(issues);
  const charCount = normalizedValue.length;
  const effectiveMinHeight = minHeight ?? config.minHeight;
  const effectiveMaxHeight = maxHeight ?? config.maxHeight;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: {} }),
      Placeholder.configure({ placeholder: placeholder ?? config.placeholder }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
      }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Markdown.configure({ html: false, tightLists: true, transformPastedText: true }),
    ],
    content: normalizedValue,
    editable: !disabled,
    autofocus: autoFocus,
    immediatelyRender: false,
    onBlur,
    onUpdate: ({ editor: activeEditor }) => {
      const markdown: string = (activeEditor.storage as any).markdown.getMarkdown();
      onChange(normalizeMarkdown(markdown));
    },
    editorProps: {
      attributes: {
        class: cn('outline-none px-4 py-3 focus:outline-none'),
      },
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current: string = normalizeMarkdown((editor.storage as any).markdown.getMarkdown());
    if (current !== normalizedValue) {
      editor.commands.setContent(normalizedValue);
    }
  }, [editor, normalizedValue]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  const insertMarkdown = (markdown: string) => {
    if (!editor || !markdown) return;
    editor.chain().focus().insertContent(markdown).run();
  };

  const setLink = () => {
    if (!editor) return;
    const current = editor.getAttributes('link').href as string | undefined;
    const href = globalThis.prompt('Paste a safe URL', current ?? '');
    if (href === null) return;
    if (!href.trim()) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().setLink({ href: href.trim() }).run();
  };

  return (
    <div
      className={cn(
        'bg-card overflow-hidden rounded-md border shadow-sm transition-colors',
        'focus-within:ring-ring focus-within:ring-2 focus-within:ring-offset-0',
        disabled && 'opacity-70',
        severity === 'error' && 'border-destructive/70',
        severity === 'warning' && 'border-amber-500/70',
        className,
      )}
    >
      <div className="bg-muted/25 flex flex-wrap items-center gap-1 border-b px-2 py-1.5">
        <ToolbarButton
          title="Bold"
          active={editor?.isActive('bold')}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBold().run()}
        >
          <Bold className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Italic"
          active={editor?.isActive('italic')}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleItalic().run()}
        >
          <Italic className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Inline code"
          active={editor?.isActive('code')}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleCode().run()}
        >
          <Code className="size-3.5" />
        </ToolbarButton>
        <div className="bg-border mx-1 h-5 w-px" />
        <ToolbarButton
          title="Heading"
          active={editor?.isActive('heading', { level: 2 })}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Bullet list"
          active={editor?.isActive('bulletList')}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list"
          active={editor?.isActive('orderedList')}
          disabled={disabled}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Link"
          active={editor?.isActive('link')}
          disabled={disabled}
          onClick={setLink}
        >
          <LinkIcon className="size-3.5" />
        </ToolbarButton>
        {config.allowTable ? (
          <ToolbarButton
            title="Insert table"
            disabled={disabled}
            onClick={() => (editor?.chain().focus() as any).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          >
            <Rows3 className="size-3.5" />
          </ToolbarButton>
        ) : null}
        <ToolbarButton
          title="Undo"
          disabled={disabled}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          <Undo2 className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Redo"
          disabled={disabled}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          <Redo2 className="size-3.5" />
        </ToolbarButton>

        <div className="ml-auto flex items-center gap-1">
          {config.snippets.length > 0 ? (
            <select
              value={lastInsertedSnippet}
              disabled={disabled}
              aria-label="Insert snippet"
              className="border-input bg-background h-8 max-w-44 rounded-md border px-2 text-xs"
              onChange={(event) => {
                const snippet = config.snippets.find((candidate) => candidate.id === event.target.value);
                setLastInsertedSnippet(event.target.value);
                if (snippet) insertMarkdown(`\n${snippet.markdown}`);
                globalThis.setTimeout(() => setLastInsertedSnippet(''), 0);
              }}
            >
              <option value="">{config.label}</option>
              {config.snippets.map((snippet) => (
                <option
                  key={snippet.id}
                  value={snippet.id}
                >
                  {snippet.label}
                </option>
              ))}
            </select>
          ) : null}
          <ViewModeButton
            mode="write"
            activeMode={viewMode}
            onClick={setViewMode}
            title="Write"
            icon={<TextCursorInput className="size-3.5" />}
          />
          <ViewModeButton
            mode="split"
            activeMode={viewMode}
            onClick={setViewMode}
            title="Split"
            icon={<SplitSquareHorizontal className="size-3.5" />}
          />
          <ViewModeButton
            mode="preview"
            activeMode={viewMode}
            onClick={setViewMode}
            title="Preview"
            icon={<Eye className="size-3.5" />}
          />
        </div>
      </div>

      <div
        className={cn(
          'grid min-h-0',
          viewMode === 'split' && 'md:grid-cols-2',
          viewMode === 'preview' && 'grid-cols-1',
        )}
        style={{
          minHeight: effectiveMinHeight,
          maxHeight: effectiveMaxHeight,
        }}
      >
        {viewMode !== 'preview' ? (
          <EditorContent
            editor={editor}
            className={cn(
              'prose prose-sm dark:prose-invert min-h-0 max-w-none overflow-y-auto',
              '[&_.ProseMirror]:min-h-[inherit] [&_.ProseMirror]:outline-none',
              '[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground/60',
              '[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none',
              '[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left',
              '[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0',
              '[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
              disabled && 'pointer-events-none',
            )}
            style={{ minHeight: effectiveMinHeight }}
          />
        ) : null}
        {viewMode !== 'write' ? (
          <div
            className={cn(
              'bg-background min-h-0 overflow-y-auto p-4',
              viewMode === 'split' && 'border-t md:border-t-0 md:border-l',
            )}
            style={{ minHeight: effectiveMinHeight }}
          >
            <MarkdownContent
              content={normalizedValue}
              mode={config.renderMode}
              emptyFallback={<p className="text-muted-foreground text-sm">{config.placeholder}</p>}
            />
          </div>
        ) : null}
      </div>

      <div className="bg-muted/20 flex flex-wrap items-center justify-between gap-2 border-t px-3 py-1.5 text-[11px]">
        <div className="text-muted-foreground flex items-center gap-2">
          <span>{config.label}</span>
          <span>/</span>
          <span>{isMarkdownStructurallyEmpty(normalizedValue) ? 'Empty' : 'Markdown'}</span>
          {saveState !== 'idle' ? (
            <>
              <span>/</span>
              <span className={cn(saveState === 'error' && 'text-destructive')}>{saveState}</span>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {issues[0] ? (
            <span className={cn(severity === 'error' ? 'text-destructive' : 'text-amber-600')}>{issues[0].message}</span>
          ) : null}
          <span className={cn(charCount > config.maxLength && 'text-destructive')}>
            {charCount}/{config.maxLength}
          </span>
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({
  title,
  active,
  disabled,
  onClick,
  children,
}: {
  title: string;
  active?: boolean | null;
  disabled?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault();
        onClick?.();
      }}
      className={cn(
        'hover:bg-muted flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground',
        active && 'bg-muted text-foreground',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      {children}
    </button>
  );
}

function ViewModeButton({
  mode,
  activeMode,
  onClick,
  title,
  icon,
}: {
  mode: ViewMode;
  activeMode: ViewMode;
  onClick: (mode: ViewMode) => void;
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={() => onClick(mode)}
      className={cn(
        'flex size-8 items-center justify-center rounded-md transition-colors',
        activeMode === mode ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {icon}
    </button>
  );
}
