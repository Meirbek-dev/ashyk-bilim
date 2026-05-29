'use client'

import { History, Loader2, Play, Send, Terminal } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  useCodeChallengeSubmission,
  useCodeChallengeSubmissions,
  useJudge0Languages,
  useRunCodeChallengeTests,
  useRunCustomTest,
  useSubmitCodeChallenge,
} from '@/features/assessments/hooks/code-challenge'

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

import AttemptHistoryList from '@/features/assessments/shared/AttemptHistoryList'
import type { ItemAnswer } from '@/features/assessments/domain/items'
import type { SubmissionStatus } from '@/features/grading/domain'
import { MarkdownContent, extractMarkdownSummary } from '@/features/content-markdown'
import { LanguageSelector } from './LanguageSelector'
import type { TestCaseResult } from './TestCaseCard'
import { TestResultsList } from './TestCaseCard'
import { CodeEditor } from './CodeEditor'

interface TestCase {
  id: string
  input: string
  expected_output: string
  description?: string
  is_visible: boolean
  weight?: number
}

interface CodeChallengeSettings {
  uuid?: string
  time_limit_ms: number
  memory_limit_kb: number
  time_limit: number
  memory_limit: number
  max_submissions?: number
  grading_strategy: string
  allowed_languages: number[]
  visible_tests: TestCase[]
  hidden_tests?: TestCase[]
  starter_code?: Record<string, string>
  solution_code?: Record<string, string>
}

interface Submission {
  uuid?: string
  submission_uuid?: string
  status:
    | 'PENDING'
    | 'PROCESSING'
    | 'COMPLETED'
    | 'FAILED'
    | 'PENDING_JUDGE0'
    | 'pending'
    | 'processing'
    | 'completed'
    | 'failed'
    | 'error'
  submission_status?: SubmissionStatus | null
  score?: number
  max_score?: number
  language_id: number
  created_at: string
  results?: TestCaseResult[]
}

interface CodeChallengeEditorProps {
  activityUuid: string
  challengeTitle?: string
  challengeDescription?: string
  settings?: CodeChallengeSettings
  initialCode?: string
  initialLanguageId?: number
  answer?: Extract<ItemAnswer, { kind: 'CODE' }>
  onAnswerChange?: (answer: Extract<ItemAnswer, { kind: 'CODE' }>) => void
  onSubmit?: () => Promise<void> | void
  disabled?: boolean
  hideHeader?: boolean
  hideSubmitButton?: boolean
  onSubmitControlChange?: (control: CodeChallengeSubmitControl | null) => void
  onSubmissionComplete?: (submission: Submission) => void
}

export interface CodeChallengeSubmitControl {
  canSubmit: boolean
  isSubmitting: boolean
  submit: () => Promise<void> | void
}

export function CodeChallengeEditor({
  activityUuid,
  challengeTitle,
  challengeDescription,
  settings,
  initialCode = '',
  initialLanguageId,
  answer,
  onAnswerChange,
  onSubmit,
  disabled = false,
  hideHeader = false,
  hideSubmitButton = false,
  onSubmitControlChange,
  onSubmissionComplete,
}: CodeChallengeEditorProps) {
  const t = useTranslations('Activities.CodeChallenges')
  const initialSelectedLanguageId = answer?.language ?? initialLanguageId ?? settings?.allowed_languages?.[0] ?? 0
  // State
  const [code, setCode] = useState(answer?.source ?? initialCode)
  const [codeByLanguage, setCodeByLanguage] = useState<Record<number, string>>(() =>
    initialSelectedLanguageId > 0 ? { [initialSelectedLanguageId]: answer?.source ?? initialCode } : {},
  )
  const [selectedLanguageId, setSelectedLanguageId] = useState(initialSelectedLanguageId)
  const [customInput, setCustomInput] = useState('')
  const [customOutput, setCustomOutput] = useState('')
  const [testResults, setTestResults] = useState<TestCaseResult[] | null>(null)
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [activeTab, setActiveTab] = useState('console')
  const runCustomTestMutation = useRunCustomTest(activityUuid)
  const runCodeChallengeTestsMutation = useRunCodeChallengeTests(activityUuid)
  const submitCodeChallengeMutation = useSubmitCodeChallenge(activityUuid)
  const runCustomTest = runCustomTestMutation.mutateAsync
  const runCodeChallengeTests = runCodeChallengeTestsMutation.mutateAsync
  const submitCodeChallenge = submitCodeChallengeMutation.mutateAsync
  const { data: judge0Languages = [] } = useJudge0Languages()
  const isRunning = runCustomTestMutation.isPending || runCodeChallengeTestsMutation.isPending
  const availableLanguages = useMemo(() => {
    const allowed = settings?.allowed_languages ?? []
    return allowed.length > 0 ? judge0Languages.filter(language => allowed.includes(language.id)) : judge0Languages
  }, [judge0Languages, settings?.allowed_languages])
  const selectedLanguage = availableLanguages.find(language => language.id === selectedLanguageId)

  // Fetch submissions history
  const { data: submissionsData, refetch: refreshSubmissions } = useCodeChallengeSubmissions(activityUuid)
  const submissions = submissionsData as Submission[] | null | undefined

  // Poll for active submission status
  const { data: activeSubmissionData } = useCodeChallengeSubmission(activityUuid, activeSubmissionId, {
    refetchInterval: activeSubmissionId ? 1000 : false,
  })
  const activeSubmission = activeSubmissionData as Submission | null | undefined

  useEffect(() => {
    if (answer?.source !== undefined && answer.source !== code) {
      setCode(answer.source)
      if (answer.language > 0) {
        setCodeByLanguage(current => ({
          ...current,
          [answer.language]: answer.source,
        }))
      }
    }
  }, [answer?.language, answer?.source, code])

  useEffect(() => {
    if (answer?.language !== undefined && answer.language !== selectedLanguageId) {
      setSelectedLanguageId(answer.language)
    }
  }, [answer?.language, selectedLanguageId])

  useEffect(() => {
    if (selectedLanguageId !== 0 || availableLanguages.length === 0) return
    setSelectedLanguageId(availableLanguages[0]!.id)
  }, [availableLanguages, selectedLanguageId])

  // Handle submission completion
  useEffect(() => {
    if (!activeSubmission) return
    const status = normalizeCodeRunStatus(activeSubmission?.status)
    if (status === 'COMPLETED' || status === 'FAILED') {
      setActiveSubmissionId(null)
      setIsSubmitting(false)
      setTestResults(activeSubmission.results || null)
      setActiveTab('results')
      refreshSubmissions()
      onSubmissionComplete?.(activeSubmission)

      if (status === 'COMPLETED' && activeSubmission.score === (activeSubmission.max_score ?? 100)) {
        toast.success(t('allTestsPassed'))
      } else if (status === 'FAILED') {
        toast.error(t('submissionFailed'))
      }
    }
  }, [activeSubmission, refreshSubmissions, onSubmissionComplete, t])

  // Set initial code from starter template
  useEffect(() => {
    if (settings?.starter_code && !code) {
      const starterCode = settings.starter_code[selectedLanguageId.toString()]
      if (starterCode) {
        setCode(starterCode)
        setCodeByLanguage(current => ({
          ...current,
          [selectedLanguageId]: starterCode,
        }))
        if (answer?.latest_run === undefined) {
          onAnswerChange?.({
            kind: 'CODE',
            language: selectedLanguageId,
            source: starterCode,
          })
        } else {
          onAnswerChange?.({
            kind: 'CODE',
            language: selectedLanguageId,
            source: starterCode,
            latest_run: answer.latest_run,
          })
        }
      }
    }
  }, [answer?.latest_run, code, onAnswerChange, selectedLanguageId, settings])

  const updateCode = useCallback(
    (nextCode: string) => {
      setCode(nextCode)
      setCodeByLanguage(current => ({
        ...current,
        [selectedLanguageId]: nextCode,
      }))
      if (answer?.latest_run === undefined) {
        onAnswerChange?.({
          kind: 'CODE',
          language: selectedLanguageId,
          source: nextCode,
        })
      } else {
        onAnswerChange?.({
          kind: 'CODE',
          language: selectedLanguageId,
          source: nextCode,
          latest_run: answer.latest_run,
        })
      }
    },
    [answer?.latest_run, onAnswerChange, selectedLanguageId],
  )

  const updateLanguage = useCallback(
    (nextLanguageId: number) => {
      const nextSource = codeByLanguage[nextLanguageId] ?? settings?.starter_code?.[String(nextLanguageId)] ?? ''
      setSelectedLanguageId(nextLanguageId)
      setCode(nextSource)
      if (answer?.latest_run === undefined) {
        onAnswerChange?.({
          kind: 'CODE',
          language: nextLanguageId,
          source: nextSource,
        })
      } else {
        onAnswerChange?.({
          kind: 'CODE',
          language: nextLanguageId,
          source: nextSource,
          latest_run: answer.latest_run,
        })
      }
    },
    [answer?.latest_run, codeByLanguage, onAnswerChange, settings?.starter_code],
  )

  // Run custom test
  const handleRunTest = useCallback(async () => {
    if (!code.trim()) {
      toast.error(t('noCodeToRun'))
      return
    }

    setCustomOutput('')
    setActiveTab('console')

    try {
      const result = await runCustomTest({
        sourceCode: code,
        languageId: selectedLanguageId,
        stdin: customInput,
      })
      setCustomOutput(result.compile_output || result.stderr || result.stdout || t('noOutput'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('runFailed'))
      setCustomOutput(error instanceof Error ? error.message : t('runFailed'))
    }
  }, [code, customInput, runCustomTest, selectedLanguageId, t])

  // Run against sample test cases
  const handleTestAgainstSamples = useCallback(async () => {
    if (!code.trim()) {
      toast.error(t('noCodeToRun'))
      return
    }

    setTestResults(null)
    setActiveTab('results')

    try {
      const result = await runCodeChallengeTests({
        sourceCode: code,
        languageId: selectedLanguageId,
      })
      setTestResults(result.results)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('testFailed'))
    }
  }, [code, runCodeChallengeTests, selectedLanguageId, t])

  // Submit solution
  const handleSubmit = useCallback(async () => {
    if (!code.trim()) {
      toast.error(t('noCodeToSubmit'))
      return
    }

    setIsSubmitting(true)
    setTestResults(null)

    try {
      if (onSubmit) {
        await onSubmit()
        toast.info(t('submissionQueued'))
        setIsSubmitting(false)
        return
      }

      const submission = await submitCodeChallenge({
        sourceCode: code,
        languageId: selectedLanguageId,
      })
      const nextSubmissionId =
        typeof submission === 'object' && submission !== null && 'submission_uuid' in submission
          ? submission.submission_uuid
          : submission.uuid
      setActiveSubmissionId(nextSubmissionId)
      toast.info(t('submissionQueued'))
    } catch (error) {
      setIsSubmitting(false)
      toast.error(error instanceof Error ? error.message : t('submissionFailed'))
    }
  }, [code, onSubmit, selectedLanguageId, submitCodeChallenge, t])

  const submitControl = useMemo<CodeChallengeSubmitControl>(
    () => ({
      canSubmit: !disabled && selectedLanguageId > 0 && Boolean(code.trim()) && !isRunning && !isSubmitting,
      isSubmitting,
      submit: handleSubmit,
    }),
    [code, disabled, handleSubmit, isRunning, isSubmitting, selectedLanguageId],
  )

  useEffect(() => {
    onSubmitControlChange?.(submitControl)
  }, [submitControl, onSubmitControlChange])

  useEffect(() => {
    return () => onSubmitControlChange?.(null)
  }, [onSubmitControlChange])

  // Get language name from ID
  const getLanguageName = (languageId: number): string => {
    const lang = judge0Languages.find(l => l.id === languageId)
    return lang?.name ?? t('languageIdFallback', { id: languageId })
  }

  // Get visible test cases - use visible_tests from settings
  const visibleTestCases = settings?.visible_tests ?? []
  const visibleTestIds = new Set(visibleTestCases.map((tc: TestCase) => tc.id))

  return (
    <div className="flex h-full flex-col">
      {/* Compact top bar (only shown when hideHeader is false and no left problem panel) */}
      {!hideHeader && !challengeTitle && !challengeDescription && visibleTestCases.length === 0 ? (
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-2">
          {settings?.allowed_languages === undefined ? (
            <LanguageSelector
              languages={availableLanguages}
              selectedId={selectedLanguageId}
              onSelect={updateLanguage}
              disabled={disabled}
            />
          ) : (
            <LanguageSelector
              languages={availableLanguages}
              selectedId={selectedLanguageId}
              onSelect={updateLanguage}
              allowedLanguages={settings.allowed_languages}
              disabled={disabled}
            />
          )}
        </div>
      ) : null}

      {/* Split-pane IDE layout */}
      <ResizablePanelGroup orientation="horizontal" className="min-h-0 flex-1">
        {/* LEFT: Problem Statement + Visible Tests + Custom Input */}
        <ResizablePanel defaultSize={35} minSize={20} className="flex flex-col">
          <ScrollArea className="h-full">
            {/* Problem description */}
            {challengeTitle || challengeDescription ? (
              <div className="border-b p-4">
                {challengeTitle && <h2 className="mb-1 text-sm leading-snug font-semibold">{challengeTitle}</h2>}
                {challengeDescription && <MarkdownContent content={challengeDescription} mode="codeProblem" />}
              </div>
            ) : null}

            {/* Visible test cases */}
            {visibleTestCases.length > 0 ? (
              <div className="border-b p-4">
                <div className="text-muted-foreground mb-3 text-xs font-medium tracking-wide uppercase">
                  {t('testCases')}
                </div>
                <div className="space-y-3">
                  {visibleTestCases.map((tc, index) => (
                    <div key={`${tc.id ?? 'tc'}-${index}`} className="bg-muted/40 rounded-md border p-3">
                      <div className="text-muted-foreground mb-2 text-xs font-medium">
                        {t('testCase')} #{index + 1}
                        {tc.description ? ` - ${extractMarkdownSummary(tc.description, 100)}` : ''}
                      </div>
                      <div className="space-y-1.5">
                        <div>
                          <div className="text-muted-foreground mb-0.5 text-xs">{t('input')}:</div>
                          <pre className="bg-background overflow-x-auto rounded border px-2 py-1 font-mono text-xs">
                            {tc.input || t('noInput')}
                          </pre>
                        </div>
                        <div>
                          <div className="text-muted-foreground mb-0.5 text-xs">{t('expectedOutput')}:</div>
                          <pre className="bg-background overflow-x-auto rounded border px-2 py-1 font-mono text-xs">
                            {tc.expected_output}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Custom input area */}
            <div className="p-4">
              <div className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                {t('customInput')}
              </div>
              <Textarea
                placeholder={t('enterCustomInput')}
                value={customInput}
                onChange={e => setCustomInput(e.target.value)}
                className="h-24 resize-none font-mono text-xs"
              />
            </div>
          </ScrollArea>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* RIGHT: Language Selector + Monaco + Action bar + Output tabs */}
        <ResizablePanel defaultSize={65} minSize={40}>
          <ResizablePanelGroup orientation="vertical" className="h-full">
            {/* Monaco editor zone */}
            <ResizablePanel defaultSize={65} minSize={30}>
              <div className="flex h-full flex-col">
                {/* Language selector bar */}
                <div className="flex shrink-0 items-center justify-end border-b px-3 py-1.5">
                  {settings?.allowed_languages === undefined ? (
                    <LanguageSelector
                      languages={availableLanguages}
                      selectedId={selectedLanguageId}
                      onSelect={updateLanguage}
                      disabled={disabled}
                    />
                  ) : (
                    <LanguageSelector
                      languages={availableLanguages}
                      selectedId={selectedLanguageId}
                      onSelect={updateLanguage}
                      allowedLanguages={settings.allowed_languages}
                      disabled={disabled}
                    />
                  )}
                </div>
                {/* Monaco */}
                {selectedLanguage?.monaco_language === undefined ? (
                  disabled ? (
                    <CodeEditor
                      value={code}
                      onChange={updateCode}
                      languageId={selectedLanguageId}
                      readOnly={disabled}
                      readOnlyMessage={t('editorReadOnly')}
                      height="100%"
                      className="min-h-0 flex-1"
                    />
                  ) : (
                    <CodeEditor
                      value={code}
                      onChange={updateCode}
                      languageId={selectedLanguageId}
                      readOnly={disabled}
                      height="100%"
                      className="min-h-0 flex-1"
                    />
                  )
                ) : disabled ? (
                  <CodeEditor
                    value={code}
                    onChange={updateCode}
                    languageId={selectedLanguageId}
                    monacoLanguage={selectedLanguage.monaco_language}
                    readOnly={disabled}
                    readOnlyMessage={t('editorReadOnly')}
                    height="100%"
                    className="min-h-0 flex-1"
                  />
                ) : (
                  <CodeEditor
                    value={code}
                    onChange={updateCode}
                    languageId={selectedLanguageId}
                    monacoLanguage={selectedLanguage.monaco_language}
                    readOnly={disabled}
                    height="100%"
                    className="min-h-0 flex-1"
                  />
                )}
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            {/* Output / Results panel */}
            <ResizablePanel defaultSize={35} minSize={15}>
              <Tabs value={activeTab} onValueChange={setActiveTab} className="flex h-full flex-col">
                {/* Tab list + action buttons in same bar */}
                <div className="flex shrink-0 items-center justify-between border-b">
                  <TabsList className="h-9 justify-start rounded-none bg-transparent px-0">
                    <TabsTrigger
                      value="console"
                      className="data-[state=active]:border-primary h-9 rounded-none border-b-2 border-transparent px-3 text-xs"
                    >
                      {t('output')}
                    </TabsTrigger>
                    <TabsTrigger
                      value="results"
                      className="data-[state=active]:border-primary h-9 rounded-none border-b-2 border-transparent px-3 text-xs"
                    >
                      {t('results')}
                      {testResults && (
                        <Badge variant="secondary" className="ml-1.5 text-[10px]">
                          {testResults.filter(r => r.passed).length}/{testResults.length}
                        </Badge>
                      )}
                    </TabsTrigger>
                    <TabsTrigger
                      value="history"
                      className="data-[state=active]:border-primary h-9 rounded-none border-b-2 border-transparent px-3 text-xs"
                    >
                      <History className="mr-1 h-3 w-3" />
                      {t('history')}
                    </TabsTrigger>
                  </TabsList>

                  {/* Action buttons */}
                  <div className="flex shrink-0 items-center gap-1 px-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleRunTest}
                      disabled={disabled || selectedLanguageId <= 0 || isRunning || isSubmitting}
                    >
                      {isRunning ? (
                        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                      ) : (
                        <Terminal className="mr-1 h-3 w-3" />
                      )}
                      {t('runCode')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={handleTestAgainstSamples}
                      disabled={
                        disabled ||
                        selectedLanguageId <= 0 ||
                        isRunning ||
                        isSubmitting ||
                        visibleTestCases.length === 0
                      }
                    >
                      <Play className="mr-1 h-3 w-3" />
                      {t('runTests')}
                    </Button>
                    {!hideSubmitButton ? (
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={handleSubmit}
                        disabled={disabled || selectedLanguageId <= 0 || isRunning || isSubmitting}
                      >
                        {isSubmitting ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <Send className="mr-1 h-3 w-3" />
                        )}
                        {t('submit')}
                      </Button>
                    ) : null}
                  </div>
                </div>

                {/* Console output tab */}
                <TabsContent value="console" className="min-h-0 flex-1 overflow-hidden">
                  <ScrollArea className="h-full p-3">
                    <pre className="font-mono text-xs whitespace-pre-wrap">
                      {customOutput || <span className="text-muted-foreground">{t('noOutput')}</span>}
                    </pre>
                  </ScrollArea>
                </TabsContent>

                {/* Test results tab */}
                <TabsContent value="results" className="min-h-0 flex-1 overflow-hidden">
                  <ScrollArea className="h-full p-3">
                    {isSubmitting && activeSubmission?.status === 'processing' ? (
                      <div className="flex flex-col items-center justify-center py-8">
                        <Loader2 className="text-primary h-6 w-6 animate-spin" />
                        <p className="text-muted-foreground mt-3 text-xs">{t('runningTests')}</p>
                      </div>
                    ) : testResults ? (
                      <TestResultsList
                        results={testResults}
                        visibleTestIds={visibleTestIds}
                        testCases={visibleTestCases}
                      />
                    ) : (
                      <p className="text-muted-foreground text-center text-xs">{t('noResultsYet')}</p>
                    )}
                  </ScrollArea>
                </TabsContent>

                {/* History tab */}
                <TabsContent value="history" className="min-h-0 flex-1 overflow-hidden">
                  <ScrollArea className="h-full p-3">
                    <div className="space-y-2">
                      {!submissions?.length ? (
                        <p className="text-muted-foreground text-center text-xs">{t('noSubmissionsYet')}</p>
                      ) : (
                        <AttemptHistoryList
                          compact
                          title={t('history')}
                          items={submissions.map((submission: Submission, index: number) => ({
                            id: submission.submission_uuid ?? submission.uuid ?? index,
                            label: t('submissionHistoryItem', {
                              attempt: submissions.length - index,
                              language: getLanguageName(submission.language_id),
                            }),
                            submittedAt: submission.created_at,
                            status: submission.submission_status ?? codeRunToSubmissionStatus(submission.status),
                            scoreLabel:
                              submission.score !== undefined
                                ? `${Math.round(submission.score)}/${submission.max_score ?? 100}`
                                : null,
                          }))}
                        />
                      )}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}

function normalizeCodeRunStatus(status: Submission['status'] | undefined) {
  return (status ?? '').toUpperCase()
}

function codeRunToSubmissionStatus(status: Submission['status']): SubmissionStatus {
  const normalized = normalizeCodeRunStatus(status)
  if (normalized === 'COMPLETED' || normalized === 'FAILED') return 'GRADED'
  return 'PENDING'
}
