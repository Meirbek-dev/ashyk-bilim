'use client';

import { AlertTriangle, CheckCircle2, Clock, Copy, MemoryStick, Play, Terminal, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { CodeResultTab, CodeSubmission, CodeVerdict, TestCaseResult } from '../domain';
import { firstFailingResult, verdictLabel, verdictTone } from '../domain';
import { SubmissionTimeline } from './SubmissionTimeline';

interface ResultsDockProps {
  activeTab: CodeResultTab;
  onTabChange: (tab: CodeResultTab) => void;
  customInput: string;
  onCustomInputChange: (value: string) => void;
  consoleOutput: string;
  results: TestCaseResult[] | null;
  verdict: CodeVerdict | null;
  submissions: CodeSubmission[];
  isRunning: boolean;
  onRunCustom: () => void;
  onRunTests: () => void;
}

export function ResultsDock({
  activeTab,
  onTabChange,
  customInput,
  onCustomInputChange,
  consoleOutput,
  results,
  verdict,
  submissions,
  isRunning,
  onRunCustom,
  onRunTests,
}: ResultsDockProps) {
  const passed = results?.filter((result) => result.passed).length ?? 0;
  const total = results?.length ?? 0;

  return (
    <Tabs
      value={activeTab}
      onValueChange={(value) => onTabChange(value as CodeResultTab)}
      className="flex h-full min-h-0 flex-col"
    >
      <div className="bg-background flex shrink-0 items-center justify-between border-b">
        <TabsList className="h-9 rounded-none bg-transparent p-0">
          <TabsTrigger
            value="testcase"
            className="data-[state=active]:border-primary h-9 rounded-none border-b-2 border-transparent px-3"
          >
            Testcase
          </TabsTrigger>
          <TabsTrigger
            value="result"
            className="data-[state=active]:border-primary h-9 rounded-none border-b-2 border-transparent px-3"
          >
            Result
            {results ? (
              <Badge
                className="ml-2"
                variant={passed === total ? 'success' : 'secondary'}
              >
                {passed}/{total}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger
            value="console"
            className="data-[state=active]:border-primary h-9 rounded-none border-b-2 border-transparent px-3"
          >
            Console
          </TabsTrigger>
          <TabsTrigger
            value="submissions"
            className="data-[state=active]:border-primary h-9 rounded-none border-b-2 border-transparent px-3"
          >
            Submissions
          </TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-1 px-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRunCustom}
            disabled={isRunning}
          >
            <Terminal className="size-4" />
            Run
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRunTests}
            disabled={isRunning}
          >
            <Play className="size-4" />
            Run tests
          </Button>
        </div>
      </div>

      <TabsContent
        value="testcase"
        className="min-h-0 flex-1 overflow-hidden"
      >
        <ScrollArea className="h-full">
          <div className="space-y-3 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Custom input</div>
                <div className="text-muted-foreground text-xs">Run code against stdin without changing the grade.</div>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={onRunCustom}
                disabled={isRunning}
              >
                <Terminal className="size-4" />
                Run
              </Button>
            </div>
            <Textarea
              value={customInput}
              onChange={(event) => onCustomInputChange(event.target.value)}
              className="min-h-28 resize-none font-mono text-xs"
              placeholder="Paste stdin here"
            />
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent
        value="result"
        className="min-h-0 flex-1 overflow-hidden"
      >
        <ScrollArea className="h-full">
          <div className="space-y-3 p-4">
            <VerdictBanner
              verdict={verdict}
              results={results}
            />
            {results?.length ? (
              <div className="space-y-2">
                {results.map((result, index) => (
                  <ResultRow
                    key={`${result.test_case_id}-${index}`}
                    result={result}
                    index={index}
                  />
                ))}
              </div>
            ) : (
              <div className="text-muted-foreground rounded-md border border-dashed p-6 text-center text-sm">
                Run tests to see diagnostics.
              </div>
            )}
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent
        value="console"
        className="min-h-0 flex-1 overflow-hidden"
      >
        <ScrollArea className="h-full">
          <div className="p-4">
            <pre className="bg-muted/40 min-h-28 rounded-md border p-3 font-mono text-xs whitespace-pre-wrap">
              {consoleOutput || 'No console output yet.'}
            </pre>
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent
        value="submissions"
        className="min-h-0 flex-1 overflow-hidden"
      >
        <SubmissionTimeline submissions={submissions} />
      </TabsContent>
    </Tabs>
  );
}

function VerdictBanner({ verdict, results }: { verdict: CodeVerdict | null; results: TestCaseResult[] | null }) {
  const firstFail = firstFailingResult(results);
  const Icon = verdict === 'ACCEPTED' ? CheckCircle2 : verdict ? XCircle : AlertTriangle;
  return (
    <div
      className={cn(
        'rounded-md border p-3',
        verdict === 'ACCEPTED'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/20 dark:text-emerald-100'
          : 'bg-card',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="size-5" />
          <div className="font-semibold">{verdictLabel(verdict)}</div>
        </div>
        <Badge variant={verdictTone(verdict)}>
          {results ? `${results.filter((result) => result.passed).length}/${results.length}` : 'idle'}
        </Badge>
      </div>
      {firstFail ? (
        <div className="text-muted-foreground mt-2 text-sm">
          First failing case: {firstFail.test_case_id}. {firstFail.status_description}
        </div>
      ) : null}
    </div>
  );
}

function ResultRow({ result, index }: { result: TestCaseResult; index: number }) {
  return (
    <div className={cn('rounded-md border bg-card', result.passed ? 'border-emerald-200' : 'border-red-200')}>
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {result.passed ? (
            <CheckCircle2 className="size-4 text-emerald-600" />
          ) : (
            <XCircle className="size-4 text-red-600" />
          )}
          <span className="truncate text-sm font-medium">Case {index + 1}</span>
          <Badge variant={result.passed ? 'success' : 'destructive'}>
            {result.passed ? 'Passed' : result.status_description}
          </Badge>
        </div>
        <div className="text-muted-foreground flex shrink-0 items-center gap-3 text-xs">
          {typeof result.time_ms === 'number' ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {result.time_ms}ms
            </span>
          ) : null}
          {typeof result.memory_kb === 'number' ? (
            <span className="inline-flex items-center gap-1">
              <MemoryStick className="size-3" />
              {(result.memory_kb / 1024).toFixed(1)}MB
            </span>
          ) : null}
        </div>
      </div>
      {result.stdout || result.stderr || result.compile_output ? (
        <div className="grid gap-2 border-t p-3">
          {result.stdout ? (
            <Output
              label="Actual output"
              value={result.stdout}
            />
          ) : null}
          {result.stderr ? (
            <Output
              label="Stderr"
              value={result.stderr}
              destructive
            />
          ) : null}
          {result.compile_output ? (
            <Output
              label="Compile output"
              value={result.compile_output}
              destructive
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function Output({ label, value, destructive = false }: { label: string; value: string; destructive?: boolean }) {
  return (
    <div>
      <div className="text-muted-foreground mb-1 flex items-center justify-between text-xs font-medium">
        {label}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-6"
          onClick={() => navigator.clipboard.writeText(value)}
        >
          <Copy className="size-3" />
        </Button>
      </div>
      <pre
        className={cn(
          'overflow-x-auto rounded border p-2 font-mono text-xs',
          destructive ? 'bg-red-50 text-red-900 dark:bg-red-950/20 dark:text-red-100' : 'bg-muted/50',
        )}
      >
        {value}
      </pre>
    </div>
  );
}
