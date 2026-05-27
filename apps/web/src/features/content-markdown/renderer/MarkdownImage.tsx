'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { useState } from 'react';

interface MarkdownImageProps {
  src?: string;
  alt?: string;
  title?: string;
  className?: string;
}

/** Safe inline image renderer for MarkdownContent.
 * Shows a placeholder badge when src is absent or load fails.
 */
export function MarkdownImage({ src, alt, title, className }: MarkdownImageProps) {
  const t = useTranslations('Features.ContentMarkdown');
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <span
        className={cn(
          'text-muted-foreground inline-flex items-center gap-1 rounded border border-dashed px-2 py-1 text-xs',
          className,
        )}
        title={title}
      >
        <span aria-hidden="true">🖼</span>
          <span>{alt || t('imageLabel')}</span>
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt ?? ''}
      title={title}
      className={cn('my-3 max-w-full rounded-md', className)}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
