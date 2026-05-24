'use client';

import { AlertTriangle, Info } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { MarkdownEditorSaveState, MarkdownPresetConfig } from '../presets/presets';
import type { MarkdownValidationIssue } from '../hooks/useMarkdownValidation';
import { getHighestMarkdownIssueSeverity } from '../hooks/useMarkdownValidation';

interface EditorStatusBarProps {
  config: MarkdownPresetConfig;
  charCount: number;
  wordCount: number;
  isEmpty: boolean;
  saveState: MarkdownEditorSaveState;
  issues: MarkdownValidationIssue[];
}

export function EditorStatusBar({
  config,
  charCount,
  wordCount,
  isEmpty,
  saveState,
  issues,
}: EditorStatusBarProps) {
  const [showAllIssues, setShowAllIssues] = useState(false);
  const severity = getHighestMarkdownIssueSeverity(issues);
  const firstIssue = issues[0];
  const nearLimit = charCount > config.maxLength * 0.9;
  const overLimit = charCount > config.maxLength;

  const saveLabel = {
    idle: null,
    dirty: 'Unsaved',
    saving: 'Saving…',
    saved: 'Saved',
    error: 'Save failed',
  }[saveState];

  return (
    <div
      className="bg-muted/20 flex flex-wrap items-center justify-between gap-2 border-t px-3 py-1.5 text-[11px]"
      role="status"
      aria-live="polite"
    >
      {/* Left: label / format / save state */}
      <div className="text-muted-foreground flex items-center gap-2">
        <span>{config.label}</span>
        <span aria-hidden="true">/</span>
        <span>{isEmpty ? 'Empty' : 'Markdown'}</span>
        {saveLabel && (
          <>
            <span aria-hidden="true">/</span>
            <span
              className={cn(
                saveState === 'error' && 'text-destructive',
                saveState === 'saved' && 'text-emerald-600',
                saveState === 'saving' && 'text-amber-600',
              )}
            >
              {saveLabel}
            </span>
          </>
        )}
        <span className="text-muted-foreground/50 hidden sm:inline">
          {wordCount} {wordCount === 1 ? 'word' : 'words'}
        </span>
      </div>

      {/* Right: validation + char count */}
      <div className="flex items-center gap-2">
        {/* Issues */}
        {firstIssue && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAllIssues((v) => !v)}
              className={cn(
                'flex items-center gap-1 rounded px-1 transition-colors',
                severity === 'error' ? 'text-destructive' : 'text-amber-600',
              )}
              aria-label={`${issues.length} ${issues.length === 1 ? 'issue' : 'issues'} — click to ${showAllIssues ? 'collapse' : 'expand'}`}
            >
              {severity === 'error' ? (
                <AlertTriangle className="size-3" />
              ) : (
                <Info className="size-3" />
              )}
              <span>{firstIssue.message}</span>
              {issues.length > 1 && (
                <span className="text-muted-foreground/60">+{issues.length - 1}</span>
              )}
            </button>

            {/* Expanded issue list */}
            {showAllIssues && issues.length > 1 && (
              <div className="bg-popover border-border absolute bottom-6 right-0 z-10 w-64 rounded-lg border p-2 shadow-lg">
                {issues.map((issue) => (
                  <div
                    key={issue.code}
                    className={cn(
                      'flex items-start gap-1.5 py-1 text-xs',
                      issue.severity === 'error' && 'text-destructive',
                      issue.severity === 'warning' && 'text-amber-600',
                      issue.severity === 'info' && 'text-blue-600',
                    )}
                  >
                    <AlertTriangle className="mt-0.5 size-3 shrink-0" />
                    <span>{issue.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Char count */}
        <span
          className={cn(
            'tabular-nums',
            overLimit && 'text-destructive font-semibold',
            nearLimit && !overLimit && 'text-amber-600',
            !nearLimit && 'text-muted-foreground',
          )}
        >
          {charCount.toLocaleString()}/{config.maxLength.toLocaleString()}
        </span>
      </div>
    </div>
  );
}
