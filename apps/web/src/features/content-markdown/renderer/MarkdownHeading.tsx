'use client';

import { Link } from 'lucide-react';
import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function slugifyMarkdownHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

export function extractMarkdownHeadingText(children: ReactNode): string {
  if (typeof children === 'string') return children;
  if (Array.isArray(children)) return children.map(extractMarkdownHeadingText).join('');
  if (children && typeof children === 'object' && 'props' in (children as object)) {
    return extractMarkdownHeadingText((children as { props?: { children?: ReactNode } }).props?.children);
  }
  return '';
}

interface MarkdownHeadingProps extends ComponentPropsWithoutRef<'h1'> {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  anchorId?: string;
  onAnchorClick?: (id: string) => void;
}

const HEADING_CLASS: Record<number, string> = {
  1: 'text-2xl font-bold mt-8 mb-4',
  2: 'text-xl font-semibold mt-6 mb-3',
  3: 'text-lg font-semibold mt-5 mb-2',
  4: 'text-base font-semibold mt-4 mb-2',
  5: 'text-sm font-semibold mt-3 mb-1',
  6: 'text-xs font-semibold mt-2 mb-1',
};

export function MarkdownHeading({ level, anchorId, children, className, onAnchorClick, ...props }: MarkdownHeadingProps) {
  const Tag = `h${level}` as 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  const text = extractMarkdownHeadingText(children);
  const id = anchorId ?? slugifyMarkdownHeading(text);

  return (
    <Tag
      id={id}
      className={cn('group flex scroll-mt-16 items-center gap-2', HEADING_CLASS[level], className)}
      {...props}
    >
      {children}
      <a
        href={`#${id}`}
        className="text-muted-foreground/0 group-hover:text-muted-foreground/60 -ml-1 opacity-0 transition-opacity group-hover:opacity-100"
        aria-label={`Link to ${text}`}
        onClick={(e) => {
          if (onAnchorClick) {
            e.preventDefault();
            onAnchorClick(id);
          }
        }}
      >
        <Link className="size-3.5" />
      </a>
    </Tag>
  );
}
