'use client';

import { ChevronDown, Wand2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import type { MarkdownSnippet } from '../presets/presets';

interface EditorSnippetPickerProps {
  snippets: MarkdownSnippet[];
  disabled?: boolean;
  label?: string;
  ariaLabel?: string;
  onSelect: (markdown: string) => void;
}

/**
 * Combobox-style snippet picker that replaces the native <select>.
 * Shows snippet preview on hover, supports keyboard navigation.
 */
export function EditorSnippetPicker({ snippets, disabled, label = 'Snippets', ariaLabel = 'Insert snippet', onSelect }: EditorSnippetPickerProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [hovered, setHovered] = useState<MarkdownSnippet | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleSelect = (snippet: MarkdownSnippet) => {
    onSelect(snippet.markdown);
    setOpen(false);
    setActiveIdx(-1);
    setHovered(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); }
      return;
    }
    if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, snippets.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    }
    if (e.key === 'Enter' && activeIdx >= 0) {
      e.preventDefault();
      const snippet = snippets[activeIdx];
      if (snippet) handleSelect(snippet);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={cn(
          'flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium',
          'bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-colors',
          disabled && 'cursor-not-allowed opacity-40',
        )}
      >
        <Wand2 className="size-3" />
        {label}
        <ChevronDown className={cn('size-3 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />

          {/* Dropdown */}
          <div className="absolute right-0 top-full z-40 mt-1 flex w-72 gap-0 overflow-hidden rounded-lg border bg-popover shadow-lg">
            {/* List */}
            <div role="listbox" aria-label={label} className="flex flex-col py-1 w-full">
              {snippets.map((snippet, idx) => (
                <button
                  key={snippet.id}
                  type="button"
                  role="option"
                  aria-selected={activeIdx === idx}
                  onClick={() => handleSelect(snippet)}
                  onMouseEnter={() => { setHovered(snippet); setActiveIdx(idx); }}
                  onMouseLeave={() => { setHovered(null); setActiveIdx(-1); }}
                  className={cn(
                    'flex flex-col px-3 py-2 text-left transition-colors',
                    activeIdx === idx ? 'bg-accent text-accent-foreground' : 'hover:bg-muted',
                  )}
                >
                  <span className="text-xs font-medium">{snippet.label}</span>
                  {hovered?.id === snippet.id && (
                    <span className="text-muted-foreground mt-0.5 line-clamp-2 font-mono text-[10px]">
                      {snippet.markdown.slice(0, 80).replace(/\n/g, '↵ ')}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
