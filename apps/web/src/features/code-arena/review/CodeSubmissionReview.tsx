'use client'

import { CheckCircle2, XCircle, Code2, Columns, FileSpreadsheet } from 'lucide-react'
import { useState } from 'react'
import { useTranslations } from 'next-intl'

import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CodeEditor } from '@/components/features/courses/code-challenges/CodeEditor'
import { CodeDiffViewer } from './CodeDiffViewer'
import type { ItemAnswer } from '@/features/assessments/domain/items'
import { cn } from '@/lib/utils'

interface CodeSubmissionReviewProps {
  answer: ItemAnswer | null | undefined
  starterTemplate?: string
}

type ReviewTab = 'code' | 'diff' | 'diagnostics'

export function CodeSubmissionReview({ answer, starterTemplate = '' }: CodeSubmissionReviewProps) {
  const t = useTranslations('Activities.CodeChallenges')
  const [activeTab, setActiveTab] = useState<ReviewTab>('code')

  if (answer?.kind !== 'CODE') {
    return (
      <div className="text-muted-foreground bg-muted/10 rounded-lg border border-dashed p-6 text-center text-sm">
        {t('noCodeAnswerSubmitted')}
      </div>
    )
  }

  const latestRun = answer.latest_run
  const passed = latestRun?.passed ?? 0
  const total = latestRun?.total ?? 0
  const accepted = total > 0 && passed === total

  return (
    <div className="grid gap-4 select-none">
      {/* Submission status overview header card */}
      <div className="bg-card flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4 shadow-xs">
        <div className="flex items-center gap-3">
          {accepted ? (
            <CheckCircle2 className="size-6 animate-bounce fill-lime-600/10 text-lime-600" />
          ) : (
            <XCircle className="size-6 fill-rose-600/10 text-rose-600" />
          )}
          <div>
            <h3 className="text-foreground text-sm font-semibold">
              {accepted ? t('solutionAccepted') : t('submissionRequiresReview')}
            </h3>
            <p className="text-muted-foreground mt-0.5 font-mono text-xs">
              {t('evaluatedLanguageId', { language: answer.language })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant={accepted ? 'success' : 'destructive'} className="text-[10px] font-bold uppercase">
            {t('testCasesPassed', { passed, total })}
          </Badge>
          {typeof latestRun?.score === 'number' ? (
            <Badge variant="outline" className="text-[10px] font-bold">
              {t('gradeValue', { score: Math.round(latestRun.score) })}
            </Badge>
          ) : null}
        </div>
      </div>

      {/* Review Tab Layout */}
      <Tabs
        value={activeTab}
        onValueChange={val => setActiveTab(val as ReviewTab)}
        className="bg-card flex flex-col overflow-hidden rounded-lg border"
      >
        <div className="bg-muted/15 border-b px-3">
          <TabsList className="h-10 gap-1 bg-transparent p-0">
            <TabsTrigger
              value="code"
              className="data-[state=active]:border-primary h-10 gap-1.5 rounded-none border-b-2 border-transparent px-3 text-xs font-medium"
            >
              <Code2 className="size-3.5" />
              {t('submittedCode')}
            </TabsTrigger>
            <TabsTrigger
              value="diff"
              className="data-[state=active]:border-primary h-10 gap-1.5 rounded-none border-b-2 border-transparent px-3 text-xs font-medium"
            >
              <Columns className="size-3.5" />
              {t('compareAgainstTemplate')}
            </TabsTrigger>
            <TabsTrigger
              value="diagnostics"
              className="data-[state=active]:border-primary h-10 gap-1.5 rounded-none border-b-2 border-transparent px-3 text-xs font-medium"
            >
              <FileSpreadsheet className="size-3.5" />
              {t('diagnosticLogsCount', {
                count: latestRun?.details?.length ?? 0,
              })}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="code" className="border-0 p-0 outline-none">
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

        <TabsContent value="diff" className="border-0 p-4 outline-none">
          <CodeDiffViewer
            expected={starterTemplate}
            actual={answer.source}
            labelExpected={t('starterTemplate')}
            labelActual={t('studentSubmission')}
          />
        </TabsContent>

        <TabsContent value="diagnostics" className="space-y-3 border-0 p-4 outline-none">
          {latestRun?.details?.length ? (
            <div className="grid gap-2.5">
              {latestRun.details.map((detail: Record<string, unknown>, index: number) => {
                const passedCase = Boolean(detail.passed)
                const testId =
                  typeof detail.test_id === 'string' || typeof detail.test_id === 'number'
                    ? String(detail.test_id)
                    : null
                const message = typeof detail.message === 'string' ? detail.message : null
                const compileOutput = typeof detail.compile_output === 'string' ? detail.compile_output : null

                return (
                  <div
                    key={testId ?? index}
                    className={cn(
                      'rounded-md border p-3.5 transition-all duration-150',
                      passedCase ? 'border-lime-500/10 bg-lime-500/[0.01]' : 'border-rose-500/20 bg-rose-500/[0.01]',
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs font-semibold">
                        {passedCase ? (
                          <CheckCircle2 className="size-4 text-lime-600" />
                        ) : (
                          <XCircle className="size-4 text-rose-500" />
                        )}
                        {t('caseNumber', { number: index + 1 })}
                        {testId ? (
                          <span className="text-muted-foreground font-mono text-[10px] font-normal">({testId})</span>
                        ) : null}
                      </div>
                      <Badge
                        variant={passedCase ? 'success' : 'destructive'}
                        className="px-1 py-0 text-[9px] uppercase"
                      >
                        {passedCase ? t('passed') : t('failed')}
                      </Badge>
                    </div>

                    {message ? <p className="text-muted-foreground mt-2 text-xs leading-relaxed">{message}</p> : null}

                    {compileOutput ? (
                      <pre className="mt-2.5 overflow-x-auto rounded border border-rose-500/20 bg-rose-500/10 p-2.5 font-mono text-xs text-rose-700 dark:text-rose-300">
                        {compileOutput}
                      </pre>
                    ) : null}
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="text-muted-foreground bg-muted/5 rounded-md border border-dashed p-6 text-center text-xs">
              {t('noDiagnosticsAvailable')}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
