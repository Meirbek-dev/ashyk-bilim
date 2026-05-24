'use client';

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  MemoryStick,
  Play,
  Terminal,
  XCircle,
  Loader2,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import type { CodeResultTab, CodeSubmission, CodeVerdict, TestCaseResult } from '../domain';
import { firstFailingResult, verdictLabel, verdictTone } from '../domain';
import { SubmissionTimeline } from './SubmissionTimeline';
import { CodeDiffViewer } from '../review/CodeDiffViewer';

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
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  // Auto-expand the first failing test case when results change
  useEffect(() => {
    if (results && results.length > 0) {
      const firstFail = results.find((r) => !r.passed);
      if (firstFail) {
        setExpandedRows({ [firstFail.test_case_id]: true });
      } else if (results[0]) {
        setExpandedRows({ [results[0].test_case_id]: true });
      }
    }
  }, [results]);

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleFocusFailedCase = (caseId: string) => {
    setExpandedRows({ [caseId]: true });
  };

  const passed = results?.filter((result) => result.passed).length ?? 0;
  const total = results?.length ?? 0;

  // Split results into visible and hidden
  const visibleResults = results?.filter((r) => r.is_visible !== false) ?? [];
  const hiddenResults = results?.filter((r) => r.is_visible === false) ?? [];
  const hiddenPassed = hiddenResults.filter((r) => r.passed).length;
  const hiddenTotal = hiddenResults.length;

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
            className="h-7 text-xs gap-1.5"
          >
            <Terminal className="size-3.5" />
            Run
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onRunTests}
            disabled={isRunning}
            className="h-7 text-xs gap-1.5"
          >
            <Play className="size-3.5" />
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
                className="h-8 gap-1.5"
              >
                <Terminal className="size-3.5" />
                Run code
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
              onFocusFailedCase={handleFocusFailedCase}
            />

            {verdict === 'RUNNING' && <RunProgressTimeline />}

            {results?.length ? (
              <div className="space-y-2">
                {/* Visible Results List */}
                {visibleResults.map((result, index) => (
                  <ResultRow
                    key={`${result.test_case_id}-${index}`}
                    result={result}
                    index={index}
                    isExpanded={Boolean(expandedRows[result.test_case_id])}
                    onToggle={() => toggleRow(result.test_case_id)}
                  />
                ))}

                {/* Hidden Results Aggregated Summary */}
                {hiddenTotal > 0 && (
                  <div className="rounded-lg border bg-card/65 p-4 border-dashed">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {hiddenPassed === hiddenTotal ? (
                          <CheckCircle2 className="size-5 text-emerald-600" />
                        ) : (
                          <XCircle className="size-5 text-rose-500" />
                        )}
                        <span className="text-sm font-semibold">Hidden Test Cases</span>
                      </div>
                      <Badge variant={hiddenPassed === hiddenTotal ? 'success' : 'destructive'}>
                        Passed {hiddenPassed}/{hiddenTotal}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Input and output diagnostics are hidden to ensure evaluation integrity.
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {hiddenResults.map((result, idx) => (
                        <span
                          key={`hidden-indicator-${idx}`}
                          className={cn(
                            'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border',
                            result.passed
                              ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-600 border-rose-500/20'
                          )}
                          title={`Hidden case ${idx + 1}: ${result.passed ? 'Passed' : result.status_description}`}
                        >
                          {idx + 1}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : verdict !== 'RUNNING' ? (
              <div className="text-muted-foreground rounded-md border border-dashed p-8 text-center text-sm">
                Run tests to see diagnostics.
              </div>
            ) : null}
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

function VerdictBanner({
  verdict,
  results,
  onFocusFailedCase,
}: {
  verdict: CodeVerdict | null;
  results: TestCaseResult[] | null;
  onFocusFailedCase: (caseId: string) => void;
}) {
  const firstFail = firstFailingResult(results);
  const Icon = verdict === 'ACCEPTED' ? CheckCircle2 : verdict === 'RUNNING' ? Loader2 : verdict ? XCircle : AlertTriangle;
  const isRunning = verdict === 'RUNNING';

  return (
    <div
      className={cn(
        'rounded-md border p-3.5 transition-colors duration-200',
        verdict === 'ACCEPTED'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:bg-emerald-950/20 dark:text-emerald-100'
          : isRunning
            ? 'border-blue-200 bg-blue-50/50 text-blue-950 dark:bg-blue-950/10 dark:text-blue-200'
            : 'bg-card'
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className={cn('size-5', isRunning && 'animate-spin')} />
          <div className="font-semibold">{verdictLabel(verdict)}</div>
        </div>
        <Badge variant={verdictTone(verdict)}>
          {results ? `${results.filter((result) => result.passed).length}/${results.length}` : isRunning ? 'running' : 'idle'}
        </Badge>
      </div>
      {firstFail ? (
        <div className="mt-2.5 text-xs text-muted-foreground flex flex-wrap items-center gap-1.5">
          <span>First failing case: <strong>{firstFail.test_case_id}</strong>. {firstFail.status_description}</span>
          <Button
            type="button"
            size="xs"
            variant="link"
            onClick={() => onFocusFailedCase(firstFail.test_case_id)}
            className="h-auto p-0 text-xs font-semibold text-rose-600 dark:text-rose-400"
          >
            Locate & Inspect
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function RunProgressTimeline() {
  const [phase, setPhase] = useState<'queue' | 'compile' | 'run' | 'judge'>('queue');

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('compile'), 800);
    const t2 = setTimeout(() => setPhase('run'), 2000);
    const t3 = setTimeout(() => setPhase('judge'), 3800);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, []);

  const steps = [
    { key: 'queue', label: 'Queued' },
    { key: 'compile', label: 'Compiling' },
    { key: 'run', label: 'Running Tests' },
    { key: 'judge', label: 'Judging' },
  ];

  const currentIdx = steps.findIndex((s) => s.key === phase);

  return (
    <div className="rounded-lg border bg-muted/20 p-4 space-y-3.5">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>Executing Judge0 Environment</span>
        <span className="font-mono animate-pulse">Running...</span>
      </div>
      
      <div className="relative flex items-center justify-between">
        <div className="absolute top-1/2 left-0 right-0 h-0.5 -translate-y-1/2 bg-border z-0" />
        <div
          className="absolute top-1/2 left-0 h-0.5 -translate-y-1/2 bg-blue-500 transition-all duration-300 z-0"
          style={{ width: `${(currentIdx / (steps.length - 1)) * 100}%` }}
        />

        {steps.map((step, idx) => {
          const isActive = idx <= currentIdx;
          const isCurrent = idx === currentIdx;

          return (
            <div key={step.key} className="flex flex-col items-center z-10">
              <div
                className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border transition-colors duration-300',
                  isCurrent
                    ? 'bg-blue-600 text-white border-blue-600 scale-110 shadow-xs'
                    : isActive
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-background text-muted-foreground border-border'
                )}
              >
                {isActive && !isCurrent ? '✓' : idx + 1}
              </div>
              <span className={cn('text-[10px] mt-1.5 font-medium', isActive ? 'text-foreground' : 'text-muted-foreground')}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ResultRowProps {
  result: TestCaseResult;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
}

function ResultRow({ result, index, isExpanded, onToggle }: ResultRowProps) {
  const diffExists = !result.passed && typeof result.expected === 'string' && typeof result.stdout === 'string';

  return (
    <div className={cn('rounded-md border bg-card transition-all duration-200', result.passed ? 'border-emerald-500/20' : 'border-rose-500/25')}>
      <div
        className="flex items-center justify-between gap-3 px-3 py-2 cursor-pointer select-none hover:bg-muted/15"
        onClick={onToggle}
      >
        <div className="flex min-w-0 items-center gap-2">
          {result.passed ? (
            <CheckCircle2 className="size-4 text-emerald-600" />
          ) : (
            <XCircle className="size-4 text-rose-500" />
          )}
          <span className="truncate text-xs font-semibold">Case {index + 1}</span>
          <Badge
            variant={result.passed ? 'success' : 'destructive'}
            className="text-[10px] px-1 py-0"
          >
            {result.passed ? 'Passed' : result.status_description}
          </Badge>
        </div>
        <div className="text-muted-foreground flex shrink-0 items-center gap-3.5 text-xs font-mono">
          {typeof result.time_ms === 'number' ? <span>{result.time_ms}ms</span> : null}
          {typeof result.memory_kb === 'number' ? <span>{(result.memory_kb / 1024).toFixed(1)}MB</span> : null}
          {isExpanded ? <ChevronUp className="size-3.5 text-muted-foreground" /> : <ChevronDown className="size-3.5 text-muted-foreground" />}
        </div>
      </div>

      {isExpanded && (
        <div className="border-t p-3 bg-background/50 space-y-3">
          {result.stdin && (
            <div>
              <div className="text-muted-foreground mb-1 text-[10px] font-bold uppercase tracking-wider">Input</div>
              <pre className="bg-muted/30 overflow-x-auto rounded border p-2 font-mono text-xs">{result.stdin}</pre>
            </div>
          )}

          {diffExists ? (
            <div className="space-y-1.5">
              <div className="text-muted-foreground text-[10px] font-bold uppercase tracking-wider">Difference</div>
              <CodeDiffViewer expected={result.expected!} actual={result.stdout!} />
            </div>
          ) : (
            result.stdout && (
              <Output label="Actual output" value={result.stdout} />
            )
          )}

          {result.stderr && (
            <Output label="Stderr" value={result.stderr} destructive />
          )}

          {result.compile_output && (
            <Output label="Compile output" value={result.compile_output} destructive />
          )}
        </div>
      )}
    </div>
  );
}

function Output({ label, value, destructive = false }: { label: string; value: string; destructive?: boolean }) {
  return (
    <div>
      <div className="text-muted-foreground mb-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
        {label}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="size-5"
          onClick={() => navigator.clipboard.writeText(value)}
        >
          <Copy className="size-3" />
        </Button>
      </div>
      <pre
        className={cn(
          'overflow-x-auto rounded border p-2.5 font-mono text-xs',
          destructive ? 'bg-red-500/10 text-red-700 dark:bg-red-950/20 dark:text-red-300 border-rose-500/20' : 'bg-muted/30'
        )}
      >
        {value}
      </pre>
    </div>
  );
}
