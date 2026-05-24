'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Markdown } from 'tiptap-markdown';
import { Bold, Code, Italic, List, ListOrdered, Heading2 } from 'lucide-react';
import { useEffect } from 'react';
import { cn } from '@/lib/utils';

interface RichTextPromptEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minHeight?: string;
}

/**
 * A lightweight Tiptap-based rich text editor that stores content as Markdown.
 * Supports bold, italic, inline code, bullet lists, ordered lists and headings.
 * LaTeX math can be written inline as $...$ — it will render on the student side.
 */
export function RichTextPromptEditor({
  value,
  onChange,
  placeholder,
  disabled = false,
  className,
  minHeight = '5rem',
}: RichTextPromptEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
      Markdown.configure({ html: false, tightLists: true, transformPastedText: true }),
    ],
    content: value,
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: ed }) => {
      const md: string = (ed.storage as any).markdown.getMarkdown();
      onChange(md);
    },
    editorProps: {
      attributes: {
        class: cn(
          'outline-none px-3 py-2 focus:outline-none',
          `min-h-[${minHeight}]`,
        ),
      },
    },
  });

  // Sync external value (e.g., when the selected item changes)
  useEffect(() => {
    if (!editor) return;
    const current: string = (editor.storage as any).markdown.getMarkdown();
    if (current !== value) {
      editor.commands.setContent(value);
    }
  }, [editor, value]);

  useEffect(() => {
    editor?.setEditable(!disabled);
  }, [disabled, editor]);

  return (
    <div
      className={cn(
        'rounded-lg border transition-colors',
        'focus-within:ring-ring focus-within:ring-2 focus-within:ring-offset-0',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      {/* Toolbar */}
      {!disabled ? (
        <div className="flex items-center gap-0.5 border-b px-2 py-1">
          <ToolbarBtn
            title="Bold (Ctrl+B)"
            active={editor?.isActive('bold')}
            onClick={() => editor?.chain().focus().toggleBold().run()}
          >
            <Bold className="size-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            title="Italic (Ctrl+I)"
            active={editor?.isActive('italic')}
            onClick={() => editor?.chain().focus().toggleItalic().run()}
          >
            <Italic className="size-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            title="Inline code"
            active={editor?.isActive('code')}
            onClick={() => editor?.chain().focus().toggleCode().run()}
          >
            <Code className="size-3.5" />
          </ToolbarBtn>
          <div className="bg-border mx-1 h-4 w-px" />
          <ToolbarBtn
            title="Heading"
            active={editor?.isActive('heading', { level: 2 })}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          >
            <Heading2 className="size-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            title="Bullet list"
            active={editor?.isActive('bulletList')}
            onClick={() => editor?.chain().focus().toggleBulletList().run()}
          >
            <List className="size-3.5" />
          </ToolbarBtn>
          <ToolbarBtn
            title="Numbered list"
            active={editor?.isActive('orderedList')}
            onClick={() => editor?.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="size-3.5" />
          </ToolbarBtn>
          <span className="text-muted-foreground ml-auto shrink-0 text-[11px]">
            Markdown &nbsp;·&nbsp; LaTeX: $...$
          </span>
        </div>
      ) : null}

      <EditorContent
        editor={editor}
        className={cn(
          'prose prose-sm dark:prose-invert max-w-none',
          '[&_.ProseMirror]:outline-none',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground/60',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left',
          '[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0',
          "[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]",
          disabled && 'pointer-events-none',
        )}
      />
    </div>
  );
}

function ToolbarBtn({
  onClick,
  active,
  title,
  children,
}: {
  onClick?: () => void;
  active?: boolean | null;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault(); // Keep editor focus
        onClick?.();
      }}
      className={cn(
        'rounded p-1.5 transition-colors',
        active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
