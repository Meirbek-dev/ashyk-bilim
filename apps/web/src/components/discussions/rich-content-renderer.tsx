'use client';

import { renderEditorHtml } from '@components/Objects/Editor/core';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';

interface RichContentRendererProps {
  content: string;
  className?: string;
}

/** Resolve content: JSON string → HTML via Tiptap schema; raw HTML → pass through. */
function resolveToHtml(content: string): string {
  if (!content) return '';
  try {
    return renderEditorHtml(JSON.parse(content) as Record<string, unknown>, { preset: 'viewing' });
  } catch {
    // not JSON – treat as legacy HTML
  }
  return content;
}

export default function RichContentRenderer({ content, className = '' }: RichContentRendererProps) {
  const html = resolveToHtml(content);
  // Sanitize the HTML content to prevent XSS attacks
  const sanitizedContent =
    typeof globalThis.window !== 'undefined'
      ? DOMPurify.sanitize(html, {
          ALLOWED_TAGS: [
            'p',
            'br',
            'strong',
            'em',
            'u',
            's',
            'code',
            'pre',
            'h1',
            'h2',
            'h3',
            'h4',
            'h5',
            'h6',
            'ul',
            'ol',
            'li',
            'blockquote',
            'a',
            'img',
            'div',
            'span',
            'iframe', // For YouTube embeds
          ],
          ALLOWED_ATTR: [
            'href',
            'target',
            'rel',
            'src',
            'alt',
            'width',
            'height',
            'class',
            'style',
            'frameborder',
            'allowfullscreen',
            'allow', // For YouTube embeds
          ],
          ALLOWED_URI_REGEXP:
            /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|data):|[^a-z]|[+.a-z-]+(?:[^+.:a-z-]|$))/i,
        })
      : html;

  return (
    <div
      className={cn(
        'prose prose-sm max-w-none',
        'overflow-wrap-anywhere word-break-break-word break-words',
        'prose-headings:mt-4 prose-headings:mb-2 prose-headings:font-semibold prose-headings:text-gray-900',
        'prose-p:my-2 prose-p:break-words prose-p:text-gray-700 prose-p:leading-relaxed',
        'prose-strong:font-semibold prose-strong:text-gray-900',
        'prose-em:text-gray-700 prose-em:italic',
        'prose-code:break-all prose-code:rounded prose-code:bg-gray-100 prose-code:px-1 prose-code:py-0.5 prose-code:font-mono prose-code:text-gray-900 prose-code:text-sm',
        'prose-pre:my-3 prose-pre:overflow-x-auto prose-pre:whitespace-pre-wrap prose-pre:rounded-md prose-pre:bg-gray-100 prose-pre:p-3 prose-pre:text-gray-900',
        'prose-blockquote:my-3 prose-blockquote:break-words prose-blockquote:border-gray-300 prose-blockquote:border-l-4 prose-blockquote:pl-4 prose-blockquote:text-gray-700 prose-blockquote:italic',
        'prose-ul:my-2 prose-ul:ml-4 prose-ul:list-outside prose-ul:list-disc prose-ul:space-y-1 prose-ul:text-gray-700',
        'prose-ol:my-2 prose-ol:ml-4 prose-ol:list-outside prose-ol:list-decimal prose-ol:space-y-1 prose-ol:text-gray-700',
        'prose-li:ml-0 prose-li:break-words prose-li:text-gray-700',
        'prose-a:break-all prose-a:text-blue-600 prose-a:underline prose-a:hover:text-blue-800',
        'prose-img:my-3 prose-img:h-auto prose-img:max-w-full prose-img:rounded-lg',
        // YouTube iframe styling
        '[&_iframe]:my-3 [&_iframe]:aspect-video [&_iframe]:w-full [&_iframe]:rounded-lg',
        // Handle empty content
        'min-h-[1rem]',
        className,
      )}
      dangerouslySetInnerHTML={{ __html: sanitizedContent }}
    />
  );
}
