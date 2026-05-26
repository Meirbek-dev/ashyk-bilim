'use client';

import { AlertTriangle, Info } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { MarkdownEditorSaveState, MarkdownPresetConfig } from '../presets/presets';
import type { MarkdownValidationIssue } from '../hooks/useMarkdownValidation';
import { getHighestMarkdownIssueSeverity } from '../hooks/useMarkdownValidation';
import { useTranslations } from 'next-intl';

interface EditorStatusBarProps {
  config: MarkdownPresetConfig;
  charCount: number;
  wordCount: number;
  isEmpty: boolean;
  saveState: MarkdownEditorSaveState;
  issues: MarkdownValidationIssue[];
}

export function EditorStatusBar({ config, charCount, wordCount, isEmpty, saveState, issues }: EditorStatusBarProps) {
  const t = useTranslations('MarkdownEditor');
  const [showAllIssues, setShowAllIssues] = useState(false);
  const severity = getHighestMarkdownIssueSeverity(issues);
  const firstIssue = issues[0];
  const nearLimit = charCount > config.maxLength * 0.9;
  const overLimit = charCount > config.maxLength;

  const saveLabel = {
    idle: null,
    dirty: t('statusBar.unsaved'),
    saving: t('statusBar.saving'),
    saved: t('statusBar.saved'),
    error: t('statusBar.saveFailed'),
  }[saveState];

  return (
    <div
      className="bg-muted/20 flex flex-wrap items-center justify-between gap-2 border-t px-3 py-1.5 text-[11px]"
      role="status"
      aria-live="polite"
    >
      <div className="text-muted-foreground flex items-center gap-2">
        <span>{config.label}</span>
        <span aria-hidden="true">/</span>
        <span>{isEmpty ? t('statusBar.empty') : t('statusBar.markdown')}</span>
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
          {wordCount} {wordCount === 1 ? t('statusBar.word') : t('statusBar.words')}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {firstIssue && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAllIssues((v) => !v)}
              className={cn(
                'flex items-center gap-1 rounded px-1 transition-colors',
                severity === 'error' ? 'text-destructive' : 'text-amber-600',
              )}
              aria-label={t('statusBar.issueToggle', { count: issues.length })}
            >
              {severity === 'error' ? <AlertTriangle className="size-3" /> : <Info className="size-3" />}
              <span>{firstIssue.message}</span>
              {issues.length > 1 && <span className="text-muted-foreground/60">+{issues.length - 1}</span>}
            </button>

            {showAllIssues && issues.length > 1 && (
              <div className="bg-popover border-border absolute right-0 bottom-6 z-10 w-64 rounded-lg border p-2 shadow-lg">
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
