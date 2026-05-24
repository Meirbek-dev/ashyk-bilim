'use client';

import { CheckCircle2, XCircle, Code2, Columns, FileSpreadsheet } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CodeEditor } from '@/components/features/courses/code-challenges/CodeEditor';
import { CodeDiffViewer } from './CodeDiffViewer';
import type { ItemAnswer } from '@/features/assessments/domain/items';

interface CodeSubmissionReviewProps {
  answer: ItemAnswer | null | undefined;
  starterTemplate?: string;
}

type ReviewTab = 'code' | 'diff' | 'diagnostics';

export function CodeSubmissionReview({ answer, starterTemplate = '' }: CodeSubmissionReviewProps) {
  const [activeTab, setActiveTab] = useState<ReviewTab>('code');

  if (!answer || answer.kind !== 'CODE') {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm bg-muted/10">
        No code answer was submitted for this item.
      </div>
    );
  }

  const latestRun = answer.latest_run;
  const passed = latestRun?.passed ?? 0;
  const total = latestRun?.total ?? 0;
  const accepted = total > 0 && passed === total;

  return (
    <div className="grid gap-4 select-none">
      {/* Submission status overview header card */}
      <div className="bg-card flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4 shadow-xs">
        <div className="flex items-center gap-3">
          {accepted ? (
            <CheckCircle2 className="size-6 text-emerald-600 fill-emerald-600/10 animate-bounce" />
          ) : (
            <XCircle className="size-6 text-rose-600 fill-rose-600/10" />
          )}
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {accepted ? 'Solution Accepted' : 'Submission Requires Review'}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">
              Evaluated Language ID: {answer.language}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge variant={accepted ? 'success' : 'destructive'} className="font-bold text-[10px] uppercase">
            {passed}/{total} Test Cases Passed
          </Badge>
          {typeof latestRun?.score === 'number' ? (
            <Badge variant="outline" className="font-bold text-[10px]">
              Grade: {Math.round(latestRun.score)}%
            </Badge>
          ) : null}
        </div>
      </div>

      {/* Review Tab Layout */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as ReviewTab)}
        className="flex flex-col border rounded-lg bg-card overflow-hidden"
      >
        <div className="border-b px-3 bg-muted/15">
          <TabsList className="h-10 bg-transparent p-0 gap-1">
            <TabsTrigger
              value="code"
              className="data-[state=active]:border-primary h-10 rounded-none border-b-2 border-transparent px-3 text-xs gap-1.5 font-medium"
            >
              <Code2 className="size-3.5" />
              Submitted Code
            </TabsTrigger>
            <TabsTrigger
              value="diff"
              className="data-[state=active]:border-primary h-10 rounded-none border-b-2 border-transparent px-3 text-xs gap-1.5 font-medium"
            >
              <Columns className="size-3.5" />
              Compare against Template
            </TabsTrigger>
            <TabsTrigger
              value="diagnostics"
              className="data-[state=active]:border-primary h-10 rounded-none border-b-2 border-transparent px-3 text-xs gap-1.5 font-medium"
            >
              <FileSpreadsheet className="size-3.5" />
              Diagnostic Logs ({latestRun?.details?.length ?? 0})
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="code" className="p-0 border-0 outline-none">
          <CodeEditor
            value={answer.source}
            onChange={() => undefined}
            languageId={answer.language}
            readOnly
            height={440}
            className="rounded-none border-0"
            options={{ minimap: { enabled: false } }}
          />
        </TabsContent>

        <TabsContent value="diff" className="p-4 border-0 outline-none">
          <CodeDiffViewer
            expected={starterTemplate}
            actual={answer.source}
            labelExpected="Starter Template"
            labelActual="Student Submission"
          />
        </TabsContent>

        <TabsContent value="diagnostics" className="p-4 border-0 outline-none space-y-3">
          {latestRun?.details?.length ? (
            <div className="grid gap-2.5">
              {latestRun.details.map((detail: Record<string, unknown>, index: number) => {
                const passedCase = Boolean(detail.passed);
                return (
                  <div
                    key={String(detail.test_id ?? index)}
                    className={cn(
                      'rounded-md border p-3.5 transition-all duration-150',
                      passedCase ? 'border-emerald-500/10 bg-emerald-500/[0.01]' : 'border-rose-500/20 bg-rose-500/[0.01]'
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        {passedCase ? (
                          <CheckCircle2 className="size-4 text-emerald-600" />
                        ) : (
                          <XCircle className="size-4 text-rose-500" />
                        )}
                        Case {index + 1}
                        {detail.test_id && (
                          <span className="text-muted-foreground font-mono text-[10px] font-normal">
                            ({String(detail.test_id)})
                          </span>
                        )}
                      </div>
                      <Badge variant={passedCase ? 'success' : 'destructive'} className="text-[9px] px-1 py-0 uppercase">
                        {passedCase ? 'Passed' : 'Failed'}
                      </Badge>
                    </div>

                    {detail.message && (
                      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                        {String(detail.message)}
                      </p>
                    )}

                    {typeof detail === 'object' &&
                    detail !== null &&
                    'compile_output' in detail &&
                    detail.compile_output ? (
                      <pre className="mt-2.5 overflow-x-auto rounded bg-rose-500/10 border border-rose-500/20 p-2.5 font-mono text-xs text-rose-700 dark:text-rose-300">
                        {String(detail.compile_output)}
                      </pre>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-xs bg-muted/5">
              No detailed test diagnostics are available.
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
