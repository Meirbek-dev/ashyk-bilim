'use client'

import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Copy, Loader2, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import type { CodeResultTab, CodeVerdict, TestCaseResult } from '../domain'
import { firstFailingResult, verdictLabel, verdictTone } from '../domain'
import { CodeDiffViewer } from '../review/CodeDiffViewer'

interface ResultsDockProps {
  activeTab: CodeResultTab
  onTabChange: (tab: CodeResultTab) => void
  customInput: string
  onCustomInputChange: (value: string) => void
  consoleOutput: string
  results: TestCaseResult[] | null
  verdict: CodeVerdict | null
}

export function ResultsDock({
  activeTab,
  onTabChange,
  customInput,
  onCustomInputChange,
  consoleOutput,
  results,
  verdict,
}: ResultsDockProps) {
  const t = useTranslations('Activities.CodeChallenges')
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({})

  // Auto-expand the first failing test case when results change
  useEffect(() => {
    if (results && results.length > 0) {
      const firstFail = results.find(r => !r.passed)
      if (firstFail) {
        setExpandedRows({ [firstFail.test_case_id]: true })
      } else if (results[0]) {
        setExpandedRows({ [results[0].test_case_id]: true })
      }
    }
  }, [results])

  const toggleRow = (id: string) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const handleFocusFailedCase = (caseId: string) => {
    setExpandedRows({ [caseId]: true })
  }

  const passed = results?.filter(result => result.passed).length ?? 0
  const total = results?.length ?? 0

  // Split results into visible and hidden
  const visibleResults = results?.filter(r => r.is_visible !== false) ?? []
  const hiddenResults = results?.filter(r => r.is_visible === false) ?? []
  const hiddenPassed = hiddenResults.filter(r => r.passed).length
  const hiddenTotal = hiddenResults.length

  return (
    <Tabs
      value={activeTab}
      onValueChange={value => onTabChange(value as CodeResultTab)}
      className="flex h-full min-h-0 flex-col"
    >
      <div className="bg-background flex shrink-0 items-center border-b">
        <TabsList className="h-9 rounded-none bg-transparent p-0">
          <TabsTrigger
            value="testcase"
            className="data-[state=active]:border-primary h-9 rounded-none border-b-2 border-transparent px-3"
          >
            {t('testCaseTab')}
          </TabsTrigger>
          <TabsTrigger
            value="result"
            className="data-[state=active]:border-primary h-9 rounded-none border-b-2 border-transparent px-3"
          >
            {t('resultTab')}
            {results ? (
              <Badge className="ml-2" variant={passed === total ? 'success' : 'secondary'}>
                {passed}/{total}
              </Badge>
            ) : null}
          </TabsTrigger>
          <TabsTrigger
            value="console"
            className="data-[state=active]:border-primary h-9 rounded-none border-b-2 border-transparent px-3"
          >
            {t('consoleTab')}
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="testcase" className="min-h-0 flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="space-y-3 p-4">
            <div>
              <div className="text-sm font-semibold">{t('customInputTitle')}</div>
            </div>
            <Textarea
              value={customInput}
              onChange={event => onCustomInputChange(event.target.value)}
              className="min-h-28 resize-none font-mono text-xs"
              placeholder={t('enterCustomInput')}
            />
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="result" className="min-h-0 flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="space-y-3 p-4">
            <VerdictBanner verdict={verdict} results={results} onFocusFailedCase={handleFocusFailedCase} />

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
                  <div className="bg-card/65 rounded-lg border border-dashed p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {hiddenPassed === hiddenTotal ? (
                          <CheckCircle2 className="size-5 text-lime-600" />
                        ) : (
                          <XCircle className="size-5 text-rose-500" />
                        )}
                        <span className="text-sm font-semibold">{t('hiddenTestCases')}</span>
                      </div>
                      <Badge variant={hiddenPassed === hiddenTotal ? 'success' : 'destructive'}>
                        {t('passedFraction', {
                          passed: hiddenPassed,
                          total: hiddenTotal,
                        })}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground mt-2 text-xs">{t('diagnosticsHidden')}</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {hiddenResults.map((result, idx) => (
                        <span
                          key={`hidden-indicator-${idx}`}
                          className={cn(
                            'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border',
                            result.passed
                              ? 'bg-lime-500/10 text-lime-600 border-lime-500/20'
                              : 'bg-rose-500/10 text-rose-600 border-rose-500/20',
                          )}
                          title={t('hiddenCaseTitle', {
                            number: idx + 1,
                            status: result.passed ? t('passed') : result.status_description,
                          })}
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
                {t('runTestsToSeeDiagnostics')}
              </div>
            ) : null}
          </div>
        </ScrollArea>
      </TabsContent>

      <TabsContent value="console" className="min-h-0 flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="p-4">
            <pre className="bg-muted/40 min-h-28 rounded-md border p-3 font-mono text-xs whitespace-pre-wrap">
              {consoleOutput || t('noConsoleOutputYet')}
            </pre>
          </div>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  )
}

function VerdictBanner({
  verdict,
  results,
  onFocusFailedCase,
}: {
  verdict: CodeVerdict | null
  results: TestCaseResult[] | null
  onFocusFailedCase: (caseId: string) => void
}) {
  const t = useTranslations('Activities.CodeChallenges')
  const firstFail = firstFailingResult(results)
  const Icon =
    verdict === 'ACCEPTED' ? CheckCircle2 : verdict === 'RUNNING' ? Loader2 : verdict ? XCircle : AlertTriangle
  const isRunning = verdict === 'RUNNING'

  return (
    <div
      className={cn(
        'rounded-md border p-3.5 transition-colors duration-200',
        verdict === 'ACCEPTED'
          ? 'border-lime-200 bg-lime-50 text-lime-950 dark:bg-lime-950/20 dark:text-lime-100'
          : isRunning
            ? 'border-blue-200 bg-blue-50/50 text-blue-950 dark:bg-blue-950/10 dark:text-blue-200'
            : 'bg-card',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className={cn('size-5', isRunning && 'animate-spin')} />
          <div className="font-semibold">{verdictLabel(verdict)}</div>
        </div>
        <Badge variant={verdictTone(verdict)}>
          {results
            ? `${results.filter(result => result.passed).length}/${results.length}`
            : isRunning
              ? t('runningState')
              : t('idleState')}
        </Badge>
      </div>
      {firstFail ? (
        <div className="text-muted-foreground mt-2.5 flex flex-wrap items-center gap-1.5 text-xs">
          <span>
            {t('firstFailingCasePrefix')} <strong>{firstFail.test_case_id}</strong>. {firstFail.status_description}
          </span>
          <Button
            type="button"
            size="xs"
            variant="link"
            onClick={() => onFocusFailedCase(firstFail.test_case_id)}
            className="h-auto p-0 text-xs font-semibold text-rose-600 dark:text-rose-400"
          >
            {t('locateAndInspect')}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

function RunProgressTimeline() {
  const t = useTranslations('Activities.CodeChallenges')
  const [phase, setPhase] = useState<'queue' | 'compile' | 'run' | 'judge'>('queue')

  useEffect(() => {
    const t1 = setTimeout(() => setPhase('compile'), 800)
    const t2 = setTimeout(() => setPhase('run'), 2000)
    const t3 = setTimeout(() => setPhase('judge'), 3800)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
      clearTimeout(t3)
    }
  }, [])

  const steps = [
    { key: 'queue', label: t('status.inQueue') },
    { key: 'compile', label: t('status.processing') },
    { key: 'run', label: t('runningTests') },
    { key: 'judge', label: t('status.processing') },
  ]

  const currentIdx = steps.findIndex(s => s.key === phase)

  return (
    <div className="bg-muted/20 space-y-3.5 rounded-lg border p-4">
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span>{t('executingEnvironment')}</span>
        <span className="animate-pulse font-mono">{t('runningLabel')}</span>
      </div>

      <div className="relative flex items-center justify-between">
        <div className="bg-border absolute top-1/2 right-0 left-0 z-0 h-0.5 -translate-y-1/2" />
        <div
          className="bg-primary absolute top-1/2 left-0 z-0 h-0.5 -translate-y-1/2 transition-all duration-300"
          style={{ width: `${(currentIdx / (steps.length - 1)) * 100}%` }}
        />

        {steps.map((step, idx) => {
          const isActive = idx <= currentIdx
          const isCurrent = idx === currentIdx

          return (
            <div key={step.key} className="z-10 flex flex-col items-center">
              <div
                className={cn(
                  'w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border transition-colors duration-300',
                  isCurrent
                    ? 'bg-primary text-primary-foreground border-primary scale-110 shadow-xs'
                    : isActive
                      ? 'bg-primary/80 text-primary-foreground border-primary/80'
                      : 'bg-background text-muted-foreground border-border',
                )}
              >
                {isActive && !isCurrent ? '✓' : idx + 1}
              </div>
              <span
                className={cn('text-[10px] mt-1.5 font-medium', isActive ? 'text-foreground' : 'text-muted-foreground')}
              >
                {step.label}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

interface ResultRowProps {
  result: TestCaseResult
  index: number
  isExpanded: boolean
  onToggle: () => void
}

function ResultRow({ result, index, isExpanded, onToggle }: ResultRowProps) {
  const t = useTranslations('Activities.CodeChallenges')
  const diffExists = !result.passed && typeof result.expected === 'string' && typeof result.stdout === 'string'

  return (
    <div
      className={cn(
        'rounded-md border bg-card transition-all duration-200',
        result.passed ? 'border-lime-500/20' : 'border-rose-500/25',
      )}
    >
      <div
        className="hover:bg-muted/15 flex cursor-pointer items-center justify-between gap-3 px-3 py-2 select-none"
        onClick={onToggle}
      >
        <div className="flex min-w-0 items-center gap-2">
          {result.passed ? (
            <CheckCircle2 className="size-4 text-lime-600" />
          ) : (
            <XCircle className="size-4 text-rose-500" />
          )}
          <span className="truncate text-xs font-semibold">{t('caseNumber', { number: index + 1 })}</span>
          <Badge variant={result.passed ? 'success' : 'destructive'} className="px-1 py-0 text-[10px]">
            {result.passed ? t('passed') : result.status_description}
          </Badge>
        </div>
        <div className="text-muted-foreground flex shrink-0 items-center gap-3.5 font-mono text-xs">
          {typeof result.time_ms === 'number' ? <span>{t('timeLimitValue', { value: result.time_ms })}</span> : null}
          {typeof result.memory_kb === 'number' ? <span>{(result.memory_kb / 1024).toFixed(1)}MB</span> : null}
          {isExpanded ? (
            <ChevronUp className="text-muted-foreground size-3.5" />
          ) : (
            <ChevronDown className="text-muted-foreground size-3.5" />
          )}
        </div>
      </div>

      {isExpanded && (
        <div className="bg-background/50 space-y-3 border-t p-3">
          {result.stdin && (
            <div>
              <div className="text-muted-foreground mb-1 text-[10px] font-bold tracking-wider uppercase">
                {t('input')}
              </div>
              <pre className="bg-muted/30 overflow-x-auto rounded border p-2 font-mono text-xs">{result.stdin}</pre>
            </div>
          )}

          {diffExists ? (
            <div className="space-y-1.5">
              <div className="text-muted-foreground text-[10px] font-bold tracking-wider uppercase">
                {t('difference')}
              </div>
              <CodeDiffViewer expected={result.expected!} actual={result.stdout!} />
            </div>
          ) : (
            result.stdout && <Output label={t('actualOutput')} value={result.stdout} />
          )}

          {result.stderr && <Output label={t('stderr')} value={result.stderr} destructive />}

          {result.compile_output && <Output label={t('compileOutput')} value={result.compile_output} destructive />}
        </div>
      )}
    </div>
  )
}

function Output({ label, value, destructive = false }: { label: string; value: string; destructive?: boolean }) {
  return (
    <div>
      <div className="text-muted-foreground mb-1 flex items-center justify-between text-[10px] font-bold tracking-wider uppercase">
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
          destructive
            ? 'bg-red-500/10 text-red-700 dark:bg-red-950/20 dark:text-red-300 border-rose-500/20'
            : 'bg-muted/30',
        )}
      >
        {value}
      </pre>
    </div>
  )
}
