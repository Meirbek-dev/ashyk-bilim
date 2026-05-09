'use client';

import { AiStreamingCursor } from './AiStreamingCursor';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import hljs from 'highlight.js';

interface AiMarkdownRendererProps {
  content: string;
  /** When true, appends a blinking cursor after the last token. */
  isStreaming?: boolean;
  className?: string;
}

/**
 * Renders AI markdown output as safe JSX.
 * Supports GFM (tables, strikethrough, task lists), fenced code with
 * syntax highlighting via highlight.js, and opens external links safely.
 *
 * Streaming cursor logic: the cursor is placed after the very last character
 * of streamed content. We compare each node's end offset to the total content
 * length to find the last rendered element. Only one cursor is ever shown.
 */
export function AiMarkdownRenderer({ content, isStreaming = false, className }: AiMarkdownRendererProps) {
  return (
    <div
      className={cn('prose prose-sm prose-invert max-w-none', className)}
      aria-live={isStreaming ? 'polite' : undefined}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // ── Headings ─────────────────────────────────────────────────
          h1: ({ children }) => <h1 className="mt-4 mb-3 text-base font-bold text-zinc-100 first:mt-0">{children}</h1>,
          h2: ({ children }) => (
            <h2 className="mt-3 mb-2 text-sm font-semibold text-zinc-100 first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-2 mb-1.5 text-sm font-medium text-zinc-200 first:mt-0">{children}</h3>
          ),

          // ── Paragraphs ────────────────────────────────────────────────
          p: ({ children, node }) => {
            // Show the cursor only after the last paragraph — identified by
            // its AST end offset matching the total content length.
            const isLastParagraph = isStreaming && node?.position?.end?.offset === content.length;
            return (
              <p className="mb-2 text-sm leading-relaxed text-zinc-200 last:mb-0">
                {children}
                {isLastParagraph && <AiStreamingCursor />}
              </p>
            );
          },

          // ── Code ──────────────────────────────────────────────────────
          code: ({ className: langClass, children, ...rest }) => {
            const match = /language-(\w+)/.exec(langClass ?? '');
            const lang = match ? match[1] : '';
            const raw = String(children).replace(/\n$/, '');

            if (langClass?.startsWith('language-') || raw.includes('\n')) {
              let highlighted = raw;
              try {
                if (lang && hljs.getLanguage(lang)) {
                  highlighted = hljs.highlight(raw, { language: lang }).value;
                } else {
                  highlighted = hljs.highlightAuto(raw).value;
                }
              } catch {
                // fall back to raw text on highlight failure
              }
              return (
                <pre className="my-2 overflow-x-auto rounded-lg border border-zinc-700/60 bg-zinc-950 p-3 text-xs leading-relaxed">
                  {/* highlight.js output is escape-safe — no user-controlled HTML */}
                  <code
                    className={cn('font-mono text-zinc-200', langClass)}
                    dangerouslySetInnerHTML={{ __html: highlighted }}
                  />
                </pre>
              );
            }

            // Inline code
            return (
              <code className="rounded bg-zinc-700/60 px-1 py-0.5 font-mono text-xs text-zinc-200">{children}</code>
            );
          },

          // ── Lists ─────────────────────────────────────────────────────
          ul: ({ children }) => <ul className="mb-2 ml-4 list-disc space-y-1 text-sm text-zinc-200">{children}</ul>,
          ol: ({ children }) => <ol className="mb-2 ml-4 list-decimal space-y-1 text-sm text-zinc-200">{children}</ol>,
          li: ({ children, node }) => {
            // Show cursor inside the last list item when content ends mid-list.
            const isLastItem = isStreaming && node?.position?.end?.offset === content.length;
            return (
              <li className="leading-relaxed">
                {children}
                {isLastItem && <AiStreamingCursor />}
              </li>
            );
          },

          // ── Blockquote ────────────────────────────────────────────────
          blockquote: ({ children }) => (
            <blockquote className="my-2 border-l-2 border-zinc-600 pl-3 text-zinc-400 italic">{children}</blockquote>
          ),

          // ── Links ─────────────────────────────────────────────────────
          a: ({ href, children }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-indigo-400 underline underline-offset-2 hover:text-indigo-300"
            >
              {children}
            </a>
          ),

          // ── Table ─────────────────────────────────────────────────────
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-xs text-zinc-200">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-zinc-700 bg-zinc-800 px-2 py-1 text-left font-semibold">{children}</th>
          ),
          td: ({ children }) => <td className="border border-zinc-700 px-2 py-1">{children}</td>,

          // ── Horizontal Rule ───────────────────────────────────────────
          hr: () => <hr className="my-3 border-zinc-700" />,

          // ── Strong / Em ───────────────────────────────────────────────
          strong: ({ children }) => <strong className="font-semibold text-zinc-100">{children}</strong>,
          em: ({ children }) => <em className="text-zinc-300 italic">{children}</em>,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
