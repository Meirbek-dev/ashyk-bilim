'use client';

import { MarkdownContent } from '@/features/content-markdown';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  /** Use a smaller prose scale for option text */
  compact?: boolean;
}

/**
 * Compatibility wrapper. New surfaces should import MarkdownContent from
 * features/content-markdown directly.
 */
export function MarkdownRenderer({ content, className, compact = false }: MarkdownRendererProps) {
  return (
    <MarkdownContent
      content={content}
      mode={compact ? 'compactRichText' : 'prompt'}
      className={className}
      compact={compact}
    />
  );
}
