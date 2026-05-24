'use client';

import { Columns, List, ToggleLeft } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface CodeDiffViewerProps {
  expected: string;
  actual: string;
  labelExpected?: string;
  labelActual?: string;
}

export function CodeDiffViewer({
  expected = '',
  actual = '',
  labelExpected = 'Expected Output',
  labelActual = 'Actual Output',
}: CodeDiffViewerProps) {
  const [isSideBySide, setIsSideBySide] = useState(true);

  const expectedLines = expected.split('\n');
  const actualLines = actual.split('\n');
  const maxLines = Math.max(expectedLines.length, actualLines.length);

  return (
    <div className="rounded-lg border bg-card text-card-foreground shadow-xs">
      <div className="bg-muted/40 flex items-center justify-between border-b px-4 py-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Output Comparison
        </span>
        <div className="flex gap-1">
          <Button
            type="button"
            size="xs"
            variant={isSideBySide ? 'secondary' : 'ghost'}
            onClick={() => setIsSideBySide(true)}
            className="h-7 text-xs gap-1"
          >
            <Columns className="size-3.5" />
            Side-by-side
          </Button>
          <Button
            type="button"
            size="xs"
            variant={!isSideBySide ? 'secondary' : 'ghost'}
            onClick={() => setIsSideBySide(false)}
            className="h-7 text-xs gap-1"
          >
            <List className="size-3.5" />
            Inline
          </Button>
        </div>
      </div>

      {isSideBySide ? (
        /* Side-by-Side Diff Layout */
        <div className="grid grid-cols-2 divide-x border-b border-border">
          {/* Left Column: Expected */}
          <div>
            <div className="bg-muted/20 border-b px-3 py-1.5 text-xs font-medium text-muted-foreground">
              {labelExpected}
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
                        : ''
                    )}
                  >
                    <span className="text-muted-foreground/45 w-6 shrink-0 select-none text-right pr-2">
                      {idx + 1}
                    </span>
                    <span className="whitespace-pre">{line || ' '}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Actual */}
          <div>
            <div className="bg-muted/20 border-b px-3 py-1.5 text-xs font-medium text-muted-foreground">
              {labelActual}
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
                        : ''
                    )}
                  >
                    <span className="text-muted-foreground/45 w-6 shrink-0 select-none text-right pr-2">
                      {idx + 1}
                    </span>
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
                <div key={`inline-eq-${idx}`} className="flex items-start px-1.5 py-0.5 text-foreground/80">
                  <span className="text-muted-foreground/45 w-12 shrink-0 select-none text-right pr-4">
                    {idx + 1}
                  </span>
                  <span className="w-4 shrink-0 select-none text-muted-foreground/30"> </span>
                  <span className="whitespace-pre">{expLine ?? ' '}</span>
                </div>
              );
            }

            return (
              <div key={`inline-diff-${idx}`} className="space-y-0.5">
                {expLine !== undefined && (
                  <div className="flex items-start px-1.5 py-0.5 rounded-sm bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border-l-2 border-emerald-500">
                    <span className="text-emerald-600/60 w-12 shrink-0 select-none text-right pr-4">
                      {idx + 1}
                    </span>
                    <span className="w-4 shrink-0 select-none text-emerald-500">+</span>
                    <span className="whitespace-pre">{expLine || ' '}</span>
                  </div>
                )}
                {actLine !== undefined && (
                  <div className="flex items-start px-1.5 py-0.5 rounded-sm bg-rose-500/10 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300 border-l-2 border-rose-500">
                    <span className="text-rose-600/60 w-12 shrink-0 select-none text-right pr-4">
                      {idx + 1}
                    </span>
                    <span className="w-4 shrink-0 select-none text-rose-500">-</span>
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
