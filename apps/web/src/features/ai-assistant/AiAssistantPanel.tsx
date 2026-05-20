'use client';

import { Bot, X, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { StudentActivityRuntime } from '@/features/student-activity/api/runtime';

interface AiAssistantPanelProps {
  open: boolean;
  onClose: () => void;
  runtime: StudentActivityRuntime;
}

/**
 * AiAssistantPanel
 *
 * A contextual AI assistant panel that slides in from the right side.
 * Always position:fixed — zero DOM-flow impact.
 *
 * Closed: translate-x-full + opacity-0 + pointer-events-none
 * Open:   translate-x-0 + opacity-100 (400px panel from right)
 *
 * Context-aware: provides relevant prompt suggestions based on the current
 * activity type.
 *
 * Triggered by the [AI] button in ActivityHeader.
 * Dismisses on close button, Escape key (handled by StudentActivityWorkspace),
 * or click-outside backdrop.
 */
export default function AiAssistantPanel({ open, onClose, runtime }: AiAssistantPanelProps) {
  const activityType = runtime.activity?.type ?? '';
  const suggestions = getSuggestions(activityType);

  return (
    <>
      {/* Slide-in panel */}
      <div
        className={cn(
          'fixed right-0 top-14 z-30',
          'h-[calc(100dvh-3.5rem)] w-[min(400px,100vw)]',
          'flex flex-col border-l border-border bg-background shadow-xl',
          'transition-[transform,opacity] duration-200 ease-out will-change-transform',
          open
            ? 'translate-x-0 opacity-100'
            : 'translate-x-full opacity-0 pointer-events-none',
        )}
        role="complementary"
        aria-label="AI Assistant"
      >
        {/* Header */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            <span className="text-sm font-semibold">AI Assistant</span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close AI Assistant"
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* Suggestions */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4">
            <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
              Suggested prompts
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {suggestions.map((suggestion, i) => (
              <button
                key={i}
                type="button"
                className="border-border hover:bg-muted/50 rounded-lg border p-3 text-left text-sm transition-colors"
              >
                {suggestion}
              </button>
            ))}
          </div>

          {/* Activity context info */}
          {runtime.activity ? (
            <div className="border-border bg-muted/30 mt-6 rounded-lg border p-3">
              <p className="text-muted-foreground mb-1 text-xs font-medium">Current activity</p>
              <p className="text-sm font-medium">{runtime.activity.title}</p>
            </div>
          ) : null}
        </div>

        {/* Chat input placeholder */}
        <div className="border-t border-border p-4">
          <div className="border-border bg-muted/30 flex items-center gap-2 rounded-lg border p-3">
            <Bot className="text-muted-foreground size-4 shrink-0" />
            <span className="text-muted-foreground text-sm">Ask anything about this activity...</span>
          </div>
        </div>
      </div>

      {/* Click-outside backdrop */}
      {open ? (
        <div
          className="fixed inset-0 z-20"
          aria-hidden
          onClick={onClose}
        />
      ) : null}
    </>
  );
}

// ── Context-aware suggestions ─────────────────────────────────────────────────

function getSuggestions(activityType: string): string[] {
  switch (activityType) {
    case 'TYPE_DYNAMIC':
      return [
        'Summarize this page for me',
        'Explain the key concepts on this page',
        'What are the main takeaways?',
        'Create a quiz from this content',
      ];
    case 'TYPE_CODE_CHALLENGE':
      return [
        'Give me a hint without revealing the answer',
        'Explain the test cases',
        'What algorithm should I use here?',
        'Explain this error message',
      ];
    case 'TYPE_EXAM':
    case 'TYPE_CUSTOM':
      return [
        'Give me a hint for this question',
        'Explain the concept being tested',
        'What topic should I review for this?',
      ];
    case 'TYPE_FILE_SUBMISSION':
      return [
        'What should I include in my submission?',
        'What are the grading criteria?',
        'Help me structure my work',
      ];
    case 'TYPE_VIDEO':
      return [
        'Summarize what I just watched',
        'Explain a concept from this video',
        'What are the key points?',
      ];
    default:
      return [
        'Help me understand this activity',
        'What are the key concepts here?',
        'Give me guidance on how to proceed',
      ];
  }
}
