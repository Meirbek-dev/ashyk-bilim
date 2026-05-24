'use client';

import { CheckCircle2, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { CodeEditor } from '@/components/features/courses/code-challenges/CodeEditor';
import type { ItemAnswer } from '@/features/assessments/domain/items';

interface CodeSubmissionReviewProps {
  answer: ItemAnswer | null | undefined;
}

export function CodeSubmissionReview({ answer }: CodeSubmissionReviewProps) {
  if (!answer || answer.kind !== 'CODE') {
    return (
      <div className="text-muted-foreground rounded-md border border-dashed p-4 text-sm">
        No code answer was submitted.
      </div>
    );
  }

  const latestRun = answer.latest_run;
  const passed = latestRun?.passed ?? 0;
  const total = latestRun?.total ?? 0;
  const accepted = total > 0 && passed === total;

  return (
    <div className="grid gap-4">
      <div className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
        <div className="flex items-center gap-2">
          {accepted ? (
            <CheckCircle2 className="size-5 text-emerald-600" />
          ) : (
            <XCircle className="size-5 text-red-600" />
          )}
          <div>
            <div className="text-sm font-semibold">{accepted ? 'Accepted' : 'Needs review'}</div>
            <div className="text-muted-foreground text-xs">Language {answer.language}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={accepted ? 'success' : 'secondary'}>
            {passed}/{total} tests
          </Badge>
          {typeof latestRun?.score === 'number' ? (
            <Badge variant="outline">{Math.round(latestRun.score)}%</Badge>
          ) : null}
        </div>
      </div>

      <CodeEditor
        value={answer.source}
        onChange={() => undefined}
        languageId={answer.language}
        readOnly
        height={420}
        options={{ minimap: { enabled: false } }}
      />

      {latestRun?.details?.length ? (
        <div className="grid gap-2">
          <div className="text-sm font-semibold">Run diagnostics</div>
          {latestRun.details.map((detail: Record<string, unknown>, index: number) => {
            const passedCase = Boolean(detail.passed);
            return (
              <div
                key={String(detail.test_id ?? index)}
                className="bg-card rounded-md border p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {passedCase ? (
                      <CheckCircle2 className="size-4 text-emerald-600" />
                    ) : (
                      <XCircle className="size-4 text-red-600" />
                    )}
                    Case {index + 1}
                  </div>
                  <Badge variant={passedCase ? 'success' : 'destructive'}>{passedCase ? 'Passed' : 'Failed'}</Badge>
                </div>
                {typeof detail === 'object' &&
                detail !== null &&
                'compile_output' in detail &&
                detail.compile_output ? (
                  <pre className="mt-2 overflow-x-auto rounded bg-red-50 p-2 font-mono text-xs text-red-900">
                    {String(detail.compile_output)}
                  </pre>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
