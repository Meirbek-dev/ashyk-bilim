'use client';

import { AlertCircle, CheckCircle2, ChevronDown, ChevronRight, Clock, MemoryStick, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// Judge0 status codes
export enum Judge0Status {
  IN_QUEUE = 1,
  PROCESSING = 2,
  ACCEPTED = 3,
  WRONG_ANSWER = 4,
  TIME_LIMIT_EXCEEDED = 5,
  COMPILATION_ERROR = 6,
  RUNTIME_ERROR_SIGSEGV = 7,
  RUNTIME_ERROR_SIGXFSZ = 8,
  RUNTIME_ERROR_SIGFPE = 9,
  RUNTIME_ERROR_SIGABRT = 10,
  RUNTIME_ERROR_NZEC = 11,
  RUNTIME_ERROR_OTHER = 12,
  INTERNAL_ERROR = 13,
  EXEC_FORMAT_ERROR = 14,
}

export interface TestCaseResult {
  test_case_id: string;
  status: number;
  status_description: string;
  passed: boolean;
  time_ms?: number | null;
  memory_kb?: number | null;
  stdout?: string | null;
  stderr?: string | null;
  compile_output?: string | null;
  message?: string | null;
}

interface TestCaseCardProps {
  result: TestCaseResult;
  index: number;
  isVisible?: boolean;
  testDescription?: string;
  expectedOutput?: string;
  input?: string;
}

export function TestCaseCard({
  result,
  index,
  isVisible = true,
  testDescription,
  expectedOutput,
  input,
}: TestCaseCardProps) {
  const t = useTranslations('Activities.CodeChallenges');
  const [isOpen, setIsOpen] = useState(false);

  const getStatusConfig = (status: number) => {
    switch (status) {
      case Judge0Status.ACCEPTED: {
        return {
          icon: CheckCircle2,
          color: 'text-green-600',
          bgColor: 'bg-green-50',
          borderColor: 'border-green-200',
          badgeVariant: 'success' as const,
          label: t('status.accepted'),
        };
      }
      case Judge0Status.WRONG_ANSWER: {
        return {
          icon: XCircle,
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          badgeVariant: 'destructive' as const,
          label: t('status.wrongAnswer'),
        };
      }
      case Judge0Status.TIME_LIMIT_EXCEEDED: {
        return {
          icon: Clock,
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-50',
          borderColor: 'border-yellow-200',
          badgeVariant: 'warning' as const,
          label: t('status.timeLimitExceeded'),
        };
      }
      case Judge0Status.COMPILATION_ERROR: {
        return {
          icon: AlertCircle,
          color: 'text-orange-600',
          bgColor: 'bg-orange-50',
          borderColor: 'border-orange-200',
          badgeVariant: 'warning' as const,
          label: t('status.compilationError'),
        };
      }
      case Judge0Status.RUNTIME_ERROR_SIGSEGV:
      case Judge0Status.RUNTIME_ERROR_SIGXFSZ:
      case Judge0Status.RUNTIME_ERROR_SIGFPE:
      case Judge0Status.RUNTIME_ERROR_SIGABRT:
      case Judge0Status.RUNTIME_ERROR_NZEC:
      case Judge0Status.RUNTIME_ERROR_OTHER: {
        return {
          icon: AlertCircle,
          color: 'text-red-600',
          bgColor: 'bg-red-50',
          borderColor: 'border-red-200',
          badgeVariant: 'destructive' as const,
          label: t('status.runtimeError'),
        };
      }
      default: {
        return {
          icon: AlertCircle,
          color: 'text-gray-600',
          bgColor: 'bg-gray-50',
          borderColor: 'border-gray-200',
          badgeVariant: 'secondary' as const,
          label: result.status_description || t('status.unknown'),
        };
      }
    }
  };

  const config = getStatusConfig(result.status);
  const StatusIcon = config.icon;

  // For hidden tests, show minimal info
  if (!isVisible) {
    return (
      <div
        className={cn('flex items-center justify-between rounded-lg border p-3', config.borderColor, config.bgColor)}
      >
        <div className="flex items-center gap-2">
          <StatusIcon className={cn('h-5 w-5', config.color)} />
          <span className="font-medium">
            {t('hiddenTest')} #{index + 1}
          </span>
        </div>
        <Badge variant={result.passed ? 'success' : 'destructive'}>{result.passed ? t('passed') : t('failed')}</Badge>
      </div>
    );
  }

  return (
    <Collapsible
      open={isOpen}
      onOpenChange={setIsOpen}
    >
      <div
        className={cn(
          'rounded-lg border transition-colors',
          config.borderColor,
          isOpen ? config.bgColor : 'bg-background hover:bg-muted/50',
        )}
      >
        <CollapsibleTrigger className="flex w-full items-center justify-between p-3">
          <div className="flex items-center gap-3">
            {isOpen ? (
              <ChevronDown className="text-muted-foreground h-4 w-4" />
            ) : (
              <ChevronRight className="text-muted-foreground h-4 w-4" />
            )}
            <StatusIcon className={cn('h-5 w-5', config.color)} />
            <span className="font-medium">
              {t('testCase')} #{index + 1}
              {testDescription && <span className="text-muted-foreground ml-2 text-sm">- {testDescription}</span>}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {result.time_ms && (
              <div className="text-muted-foreground flex items-center gap-1 text-sm">
                <Clock className="h-4 w-4" />
                {t('timeLimitValue', { value: result.time_ms.toFixed(0) })}
              </div>
            )}
            {result.memory_kb && (
              <div className="text-muted-foreground flex items-center gap-1 text-sm">
                <MemoryStick className="h-4 w-4" />
                {t('memoryLimitValue', { value: (result.memory_kb / 1024).toFixed(1) })}
              </div>
            )}
            <Badge variant={result.passed ? 'success' : 'destructive'}>{config.label}</Badge>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="space-y-3 border-t p-3">
            {/* Input */}
            {input && (
              <div>
                <div className="text-muted-foreground mb-1 text-sm font-medium">{t('input')}:</div>
                <pre className="bg-muted overflow-x-auto rounded p-2 text-sm">{input}</pre>
              </div>
            )}

            {/* Expected Output */}
            {expectedOutput && (
              <div>
                <div className="text-muted-foreground mb-1 text-sm font-medium">{t('expectedOutput')}:</div>
                <pre className="bg-muted overflow-x-auto rounded p-2 text-sm">{expectedOutput}</pre>
              </div>
            )}

            {/* Actual Output */}
            {result.stdout && (
              <div>
                <div className="text-muted-foreground mb-1 text-sm font-medium">{t('actualOutput')}:</div>
                <pre
                  className={cn(
                    'overflow-x-auto rounded p-2 text-sm',
                    result.passed ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800',
                  )}
                >
                  {result.stdout}
                </pre>
              </div>
            )}

            {/* Compilation Error */}
            {result.compile_output && (
              <div>
                <div className="mb-1 text-sm font-medium text-red-600">{t('compilationOutput')}:</div>
                <pre className="overflow-x-auto rounded bg-red-50 p-2 text-sm text-red-800">
                  {result.compile_output}
                </pre>
              </div>
            )}

            {/* Runtime Error */}
            {result.stderr && (
              <div>
                <div className="mb-1 text-sm font-medium text-red-600">{t('stderr')}:</div>
                <pre className="overflow-x-auto rounded bg-red-50 p-2 text-sm text-red-800">{result.stderr}</pre>
              </div>
            )}

            {/* Message */}
            {result.message && <div className="text-muted-foreground text-sm">{result.message}</div>}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

interface TestResultsListProps {
  results: TestCaseResult[];
  visibleTestIds?: Set<string>;
  testCases?: {
    id: string;
    input?: string;
    expected_output?: string;
    description?: string;
  }[];
}

export function TestResultsList({ results, visibleTestIds, testCases = [] }: TestResultsListProps) {
  const t = useTranslations('Activities.CodeChallenges');

  const passed = results.filter((r) => r.passed).length;
  const total = results.length;

  // Build test case map for details
  const testCaseMap = new Map(testCases.map((tc) => [tc.id, tc]));

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">{t('testResults')}</h3>
        <div className="flex items-center gap-2">
          <Badge variant={passed === total ? 'success' : 'secondary'}>
            {passed}/{total} {t('passed')}
          </Badge>
        </div>
      </div>

      {/* Results List */}
      <div className="space-y-2">
        {results.map((result, index) => {
          const testCase = testCaseMap.get(result.test_case_id);
          const isVisible = visibleTestIds ? visibleTestIds.has(result.test_case_id) : true;

          return (
            <TestCaseCard
              key={`${result.test_case_id}-${index}`}
              result={result}
              index={index}
              isVisible={isVisible}
              testDescription={testCase?.description}
              expectedOutput={isVisible ? testCase?.expected_output : undefined}
              input={isVisible ? testCase?.input : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

export default TestCaseCard;
