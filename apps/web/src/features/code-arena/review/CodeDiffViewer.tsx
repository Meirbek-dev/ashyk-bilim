'use client';

import { Columns, List } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CodeDiffViewerProps {
  expected: string;
  actual: string;
  labelExpected?: string;
  labelActual?: string;
}

export function CodeDiffViewer({ expected, actual, labelExpected, labelActual }: CodeDiffViewerProps) {
  const t = useTranslations('Activities.CodeChallenges');
  const [isSideBySide, setIsSideBySide] = useState(true);

  const resolvedExpected = labelExpected ?? t('expectedOutput');
  const resolvedActual = labelActual ?? t('actualOutput');

  const expectedLines = expected.split('\n');
  const actualLines = actual.split('\n');
  const maxLines = Math.max(expectedLines.length, actualLines.length);

  return (
    <div className="bg-card text-card-foreground rounded-lg border shadow-xs">
      <div className="bg-muted/40 flex items-center justify-between border-b px-4 py-2">
        <span className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
          {t('outputComparison')}
        </span>
        <div className="flex gap-1">
          <Button
            type="button"
            size="xs"
            variant={isSideBySide ? 'secondary' : 'ghost'}
            onClick={() => setIsSideBySide(true)}
            className="h-7 gap-1 text-xs"
          >
            <Columns className="size-3.5" />
            {t('sideBySide')}
          </Button>
          <Button
            type="button"
            size="xs"
            variant={!isSideBySide ? 'secondary' : 'ghost'}
            onClick={() => setIsSideBySide(false)}
            className="h-7 gap-1 text-xs"
          >
            <List className="size-3.5" />
            {t('inline')}
          </Button>
        </div>
      </div>

      {isSideBySide ? (
        /* Side-by-Side Diff Layout */
        <div className="border-border grid grid-cols-2 divide-x border-b">
          {/* Left Column: Expected */}
          <div>
            <div className="bg-muted/20 text-muted-foreground border-b px-3 py-1.5 text-xs font-medium">
              {resolvedExpected}
            </div>
            <div className="overflow-x-auto p-3 font-mono text-xs leading-relaxed">
              {expectedLines.map((line, idx) => {
                const differs = line !== actualLines[idx];
                return (
                  <div
                    key={`expected-${idx}`}
                    className={cn(
                      'flex items-start px-1.5 py-0.5 rounded-sm',
                      differs && line
                        ? 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border-l-2 border-emerald-500'
                        : '',
                    )}
                  >
                    <span className="text-muted-foreground/45 w-6 shrink-0 pr-2 text-right select-none">{idx + 1}</span>
                    <span className="whitespace-pre">{line || ' '}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Actual */}
          <div>
            <div className="bg-muted/20 text-muted-foreground border-b px-3 py-1.5 text-xs font-medium">
              {resolvedActual}
            </div>
            <div className="overflow-x-auto p-3 font-mono text-xs leading-relaxed">
              {actualLines.map((line, idx) => {
                const differs = line !== expectedLines[idx];
                return (
                  <div
                    key={`actual-${idx}`}
                    className={cn(
                      'flex items-start px-1.5 py-0.5 rounded-sm',
                      differs && line
                        ? 'bg-rose-500/10 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300 border-l-2 border-rose-500'
                        : '',
                    )}
                  >
                    <span className="text-muted-foreground/45 w-6 shrink-0 pr-2 text-right select-none">{idx + 1}</span>
                    <span className="whitespace-pre">{line || ' '}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        /* Inline Diff Layout */
        <div className="overflow-x-auto p-3 font-mono text-xs leading-relaxed">
          {Array.from({ length: maxLines }).map((_, idx) => {
            const expLine = expectedLines[idx];
            const actLine = actualLines[idx];
            const isDifferent = expLine !== actLine;

            if (!isDifferent) {
              return (
                <div
                  key={`inline-eq-${idx}`}
                  className="text-foreground/80 flex items-start px-1.5 py-0.5"
                >
                  <span className="text-muted-foreground/45 w-12 shrink-0 pr-4 text-right select-none">{idx + 1}</span>
                  <span className="text-muted-foreground/30 w-4 shrink-0 select-none"> </span>
                  <span className="whitespace-pre">{expLine ?? ' '}</span>
                </div>
              );
            }

            return (
              <div
                key={`inline-diff-${idx}`}
                className="space-y-0.5"
              >
                {expLine !== undefined && (
                  <div className="flex items-start rounded-sm border-l-2 border-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    <span className="w-12 shrink-0 pr-4 text-right text-emerald-600/60 select-none">{idx + 1}</span>
                    <span className="w-4 shrink-0 text-emerald-500 select-none">+</span>
                    <span className="whitespace-pre">{expLine || ' '}</span>
                  </div>
                )}
                {actLine !== undefined && (
                  <div className="flex items-start rounded-sm border-l-2 border-rose-500 bg-rose-500/10 px-1.5 py-0.5 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300">
                    <span className="w-12 shrink-0 pr-4 text-right text-rose-600/60 select-none">{idx + 1}</span>
                    <span className="w-4 shrink-0 text-rose-500 select-none">-</span>
                    <span className="whitespace-pre">{actLine || ' '}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
