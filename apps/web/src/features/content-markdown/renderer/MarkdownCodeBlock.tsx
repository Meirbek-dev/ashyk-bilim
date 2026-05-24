'use client';

import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface MarkdownCodeBlockProps {
  code: string;
  language?: string;
  compact?: boolean;
}

export function MarkdownCodeBlock({ code, language, compact = false }: MarkdownCodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!navigator?.clipboard) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    globalThis.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div className="not-prose group my-3 overflow-hidden rounded-md border bg-zinc-950 text-zinc-50">
      <div className="flex h-8 items-center justify-between border-b border-white/10 px-3">
        <span className="text-[11px] font-medium text-zinc-400">{language || 'text'}</span>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-6 text-zinc-400 hover:bg-white/10 hover:text-zinc-50"
          onClick={copy}
          aria-label="Copy code"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </Button>
      </div>
      <pre
        className={cn(
          'overflow-x-auto p-3 font-mono text-[13px] leading-6',
          compact && 'p-2 text-xs leading-5',
        )}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
