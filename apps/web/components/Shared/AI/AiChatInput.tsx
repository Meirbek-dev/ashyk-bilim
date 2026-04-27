'use client';

import UserAvatar from '@components/Objects/UserAvatar';
import { Button } from '@components/ui/button';
import { Input } from '@components/ui/input';
import { Send, Square } from 'lucide-react';
import type { KeyboardEvent } from 'react';

interface AiChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  placeholder?: string;
  /** Whether to show the user avatar to the left of the input. */
  showAvatar?: boolean;
  /**
   * When provided and `disabled` is true, the send button is replaced by a
   * stop button that calls this handler — allowing the user to cancel an
   * in-progress generation.
   */
  onStop?: () => void;
}

/**
 * Shared input row used by AI chat surfaces.
 * Handles Enter-to-send internally so consumers don't need to re-implement it.
 * When `onStop` is provided and the input is disabled (i.e. generating), the
 * action button becomes a stop button instead of send.
 */
export function AiChatInput({
  value,
  onChange,
  onSend,
  disabled = false,
  placeholder = 'Ask Ashyq Ai…',
  showAvatar = true,
  onStop,
}: AiChatInputProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !disabled && value.trim()) {
      e.preventDefault();
      onSend();
    }
  };

  const showStop = disabled && onStop !== undefined;

  return (
    <div className="flex items-center gap-2">
      {showAvatar && (
        <UserAvatar
          size="sm"
          variant="outline"
        />
      )}
      <Input
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={placeholder}
        className="flex-1 border-zinc-700 bg-zinc-800 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-zinc-600"
      />
      {showStop ? (
        <Button
          variant="ghost"
          size="icon"
          onClick={onStop}
          aria-label="Stop generation"
          type="button"
          className="h-9 w-9 shrink-0 text-zinc-400 hover:text-red-400"
        >
          <Square className="h-3.5 w-3.5 fill-current" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          onClick={onSend}
          disabled={disabled || !value.trim()}
          aria-label="Send message"
          type="button"
          className="h-9 w-9 shrink-0 text-zinc-500 hover:text-black disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
