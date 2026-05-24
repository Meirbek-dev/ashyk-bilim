'use client';

import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import 'katex/dist/katex.min.css';

import { cn } from '@/lib/utils';
import type { MarkdownRenderMode } from '../presets/presets';
import { extractMarkdownSummary } from '../utils/markdown-extract';
import { sanitizeMarkdownUrl } from '../utils/markdown-sanitize';
import { MarkdownCodeBlock } from './MarkdownCodeBlock';

interface MarkdownContentProps {
  content: string;
  mode?: MarkdownRenderMode;
  className?: string;
  compact?: boolean;
  emptyFallback?: React.ReactNode;
}

const modeClassName: Record<MarkdownRenderMode, string> = {
  prompt: 'prose-sm leading-relaxed',
  taskDescription: 'prose-base leading-relaxed',
  compactRichText: 'prose-sm leading-normal',
  codeProblem: 'prose-sm leading-relaxed',
  codeSpec: 'prose-sm leading-relaxed',
  courseDescription: 'prose-base md:prose-lg leading-relaxed',
  plainSummary: '',
};

export function MarkdownContent({
  content,
  mode = 'prompt',
  className,
  compact = false,
  emptyFallback = null,
}: MarkdownContentProps) {
  if (!content?.trim()) return emptyFallback;
  if (mode === 'plainSummary') return <>{extractMarkdownSummary(content)}</>;

  return (
    <div
      className={cn(
        'prose dark:prose-invert max-w-none',
        modeClassName[mode],
        compact && 'prose-sm',
        '[&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
        '[&_table]:my-0 [&_th]:whitespace-nowrap [&_td]:align-top',
        '[&_pre]:m-0 [&_pre]:bg-transparent [&_pre]:p-0',
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          a: ({ href, children, ...props }) => {
            const safeHref = sanitizeMarkdownUrl(href);
            if (!safeHref) {
              return <span className="text-muted-foreground underline decoration-dotted">{children}</span>;
            }
            const external = /^https?:\/\//i.test(safeHref);
            return (
              <a
                {...props}
                href={safeHref}
                target={external ? '_blank' : undefined}
                rel={external ? 'noopener noreferrer' : undefined}
              >
                {children}
              </a>
            );
          },
          code: ({ className: codeClassName, children, ...props }) => {
            const match = /language-(\w+)/.exec(codeClassName ?? '');
            const code = String(children).replace(/\n$/, '');
            if (!code.includes('\n') && !match) {
              return (
                <code
                  {...props}
                  className={cn('rounded bg-muted px-1 py-0.5 text-[0.92em]', codeClassName)}
                >
                  {children}
                </code>
              );
            }
            return (
              <MarkdownCodeBlock
                code={code}
                language={match?.[1]}
                compact={compact || mode === 'compactRichText'}
              />
            );
          },
          table: ({ children }) => (
            <div className="not-prose my-4 overflow-x-auto rounded-md border">
              <table className="m-0 w-full min-w-max border-collapse text-sm">{children}</table>
            </div>
          ),
          img: ({ alt }) => (
            <span className="text-muted-foreground inline-flex rounded border border-dashed px-2 py-1 text-xs">
              {alt || 'Image'}
            </span>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
