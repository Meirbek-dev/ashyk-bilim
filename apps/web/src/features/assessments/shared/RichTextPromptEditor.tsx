'use client';

import { MarkdownEditor } from '@/features/content-markdown';

interface RichTextPromptEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minHeight?: string;
}

/**
 * Compatibility wrapper. New surfaces should import MarkdownEditor from
 * features/content-markdown directly.
 */
export function RichTextPromptEditor({
  value,
  onChange,
  placeholder,
  disabled = false,
  className,
  minHeight = '160px',
}: RichTextPromptEditorProps) {
  const parsedMinHeight = Number.parseInt(minHeight, 10);
  return (
    <MarkdownEditor
      value={value}
      onChange={onChange}
      preset="questionPrompt"
      placeholder={placeholder}
      disabled={disabled}
      className={className}
      minHeight={Number.isFinite(parsedMinHeight) ? parsedMinHeight : 160}
    />
  );
}
