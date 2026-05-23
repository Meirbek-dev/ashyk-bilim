'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';
import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
  content: string;
  className?: string;
  /** Use a smaller prose scale for option text */
  compact?: boolean;
}

/**
 * Renders Markdown text with:
 * - GitHub Flavored Markdown (tables, task lists, strikethrough)
 * - Inline and block LaTeX math via KaTeX  ($...$ and $$...$$)
 *
 * Safe for student-facing question prompts and option text.
 */
export function MarkdownRenderer({ content, className, compact = false }: MarkdownRendererProps) {
  if (!content) return null;

  return (
    <div
      className={cn(
        'prose dark:prose-invert max-w-none',
        compact ? 'prose-sm' : 'prose-base',
        // Keep prose styles contained when embedded in card layouts
        '[&_p:last-child]:mb-0 [&_p:first-child]:mt-0',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
