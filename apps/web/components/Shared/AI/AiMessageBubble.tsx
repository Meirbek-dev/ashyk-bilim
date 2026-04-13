'use client';

import { AiMarkdownRenderer } from './AiMarkdownRenderer';
import UserAvatar from '@components/Objects/UserAvatar';
import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AiMessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  /** When true shows the blinking streaming cursor inside the bubble. */
  isStreaming?: boolean;
}

/**
 * Role-aware chat message bubble.
 * - Assistant: left-aligned, dark background, markdown rendered with copy button.
 * - User: right-aligned, indigo tint, plain text (user input is never markdown).
 */
export function AiMessageBubble({ role, content, isStreaming = false }: AiMessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Clear the reset-timer on unmount to prevent state updates on an
  // unmounted component if the user copies and then quickly navigates away.
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, []);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      if (timerRef.current !== null) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard access denied — silently ignore
    }
  };

  return (
    <div className={cn('group flex items-start gap-2', role === 'user' && 'flex-row-reverse')}>
      <UserAvatar
        size="sm"
        variant="outline"
        predefined_avatar={role === 'assistant' ? 'ai' : undefined}
      />

      <div className={cn('relative min-w-0 max-w-[85%]', role === 'assistant' ? 'flex-1' : 'max-w-[78%]')}>
        {role === 'assistant' ? (
          <>
            <div className="rounded-lg bg-zinc-800 px-3 py-2">
              <AiMarkdownRenderer
                content={content}
                isStreaming={isStreaming}
              />
            </div>

            {/* Copy button — visible on hover for desktop, always visible on touch */}
            {!isStreaming && content && (
              <button
                onClick={handleCopy}
                aria-label={copied ? 'Copied' : 'Copy response'}
                className={cn(
                  'absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-md border border-zinc-700',
                  'bg-zinc-800 text-zinc-500 transition-all hover:border-zinc-600 hover:text-zinc-300',
                  'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                  // Always show on touch devices
                  'sm:opacity-0',
                  copied && 'border-emerald-700/60 text-emerald-400',
                )}
                type="button"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
              </button>
            )}
          </>
        ) : (
          <div className="rounded-lg bg-indigo-600/20 px-3 py-2">
            <p className="text-sm leading-relaxed text-zinc-100">{content}</p>
          </div>
        )}
      </div>
    </div>
  );
}
