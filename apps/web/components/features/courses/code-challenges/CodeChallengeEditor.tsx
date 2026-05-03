'use client';

import { History, Loader2, Play, Send, Terminal } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  useCodeChallengeSubmission,
  useCodeChallengeSubmissions,
  useRunCodeChallengeTests,
  useRunCustomTest,
  useSubmitCodeChallenge,
} from '@/features/assessments/registry/code-challenge/hooks';

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

import AttemptHistoryList from '@/features/assessments/shared/AttemptHistoryList';
import type { SubmissionStatus } from '@/features/grading/domain';
import { JUDGE0_LANGUAGES, LanguageSelector } from './LanguageSelector';
import type { TestCaseResult } from './TestCaseCard';
import { TestResultsList } from './TestCaseCard';
import { CodeEditor } from './CodeEditor';

interface TestCase {
  id: string;
  input: string;
  expected_output: string;
  description?: string;
  is_visible: boolean;
  weight?: number;
}

interface CodeChallengeSettings {
  uuid?: string;
  time_limit_ms: number;
  memory_limit_kb: number;
  time_limit: number;
  memory_limit: number;
  max_submissions?: number;
  grading_strategy: string;
  allowed_languages: number[];
  visible_tests: TestCase[];
  hidden_tests?: TestCase[];
  starter_code?: Record<string, string>;
  solution_code?: Record<string, string>;
}

interface Submission {
  uuid?: string;
  submission_uuid?: string;
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
    | 'error';
  submission_status?: SubmissionStatus | null;
  score?: number;
  max_score?: number;
  language_id: number;
  created_at: string;
  results?: TestCaseResult[];
  test_results?: { results?: TestCaseResult[] };
}

interface CodeChallengeEditorProps {
  activityUuid: string;
  challengeTitle?: string;
  challengeDescription?: string;
  settings?: CodeChallengeSettings;
  initialCode?: string;
  initialLanguageId?: number;
  hideHeader?: boolean;
  hideSubmitButton?: boolean;
  onSubmitControlChange?: (control: CodeChallengeSubmitControl | null) => void;
  onSubmissionComplete?: (submission: Submission) => void;
}

export interface CodeChallengeSubmitControl {
  canSubmit: boolean;
  isSubmitting: boolean;
  submit: () => void;
}

export function CodeChallengeEditor({
  activityUuid,
  challengeTitle,
  challengeDescription,
  settings,
  initialCode = '',
  initialLanguageId,
  hideHeader = false,
  hideSubmitButton = false,
  onSubmitControlChange,
  onSubmissionComplete,
}: CodeChallengeEditorProps) {
  const t = useTranslations('Activities.CodeChallenges');
  // State
  const [code, setCode] = useState(initialCode);
  const [selectedLanguageId, setSelectedLanguageId] = useState(
    initialLanguageId ?? settings?.allowed_languages?.[0] ?? 71, // Default to Python
  );
  const [customInput, setCustomInput] = useState('');
  const [customOutput, setCustomOutput] = useState('');
  const [testResults, setTestResults] = useState<TestCaseResult[] | null>(null);
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('testcases');
  const runCustomTestMutation = useRunCustomTest(activityUuid);
  const runCodeChallengeTestsMutation = useRunCodeChallengeTests(activityUuid);
  const submitCodeChallengeMutation = useSubmitCodeChallenge(activityUuid);
  const isRunning = runCustomTestMutation.isPending || runCodeChallengeTestsMutation.isPending;

  // Fetch submissions history
  const { data: submissionsData, refetch: refreshSubmissions } = useCodeChallengeSubmissions(activityUuid);
  const submissions = submissionsData as Submission[] | null | undefined;

  // Poll for active submission status
  const { data: activeSubmissionData } = useCodeChallengeSubmission(activeSubmissionId, {
    refetchInterval: activeSubmissionId ? 1000 : false,
  });
  const activeSubmission = activeSubmissionData as Submission | null | undefined;

  // Handle submission completion
  useEffect(() => {
    if (!activeSubmission) return;
    const status = normalizeCodeRunStatus(activeSubmission?.status);
    if (status === 'COMPLETED' || status === 'FAILED') {
      setActiveSubmissionId(null);
      setIsSubmitting(false);
      setTestResults(activeSubmission.results || activeSubmission.test_results?.results || null);
      setActiveTab('results');
      refreshSubmissions();
      onSubmissionComplete?.(activeSubmission);

      if (status === 'COMPLETED' && activeSubmission.score === (activeSubmission.max_score ?? 100)) {
        toast.success(t('allTestsPassed'));
      } else if (status === 'FAILED') {
        toast.error(t('submissionFailed'));
      }
    }
  }, [activeSubmission, refreshSubmissions, onSubmissionComplete, t]);

  // Set initial code from starter template
  useEffect(() => {
    if (settings?.starter_code && !code) {
      const starterCode = settings.starter_code[selectedLanguageId.toString()];
      if (starterCode) {
        setCode(starterCode);
      }
    }
  }, [settings, selectedLanguageId, code]);

  // Run custom test
  const handleRunTest = useCallback(async () => {
    if (!code.trim()) {
      toast.error(t('noCodeToRun'));
      return;
    }

    setCustomOutput('');
    setActiveTab('custom');

    try {
      const result = await runCustomTestMutation.mutateAsync({
        sourceCode: btoa(code),
        languageId: selectedLanguageId,
        stdin: btoa(customInput),
      });
      setCustomOutput(result.compile_output || result.stderr || result.stdout || t('noOutput'));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('runFailed'));
      setCustomOutput(error instanceof Error ? error.message : t('runFailed'));
    }
  }, [code, customInput, runCustomTestMutation, selectedLanguageId, t]);

  // Run against sample test cases
  const handleTestAgainstSamples = useCallback(async () => {
    if (!code.trim()) {
      toast.error(t('noCodeToRun'));
      return;
    }

    setTestResults(null);
    setActiveTab('results');

    try {
      const result = await runCodeChallengeTestsMutation.mutateAsync({
        sourceCode: btoa(code),
        languageId: selectedLanguageId,
      });
      setTestResults(result.results);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('testFailed'));
    }
  }, [code, runCodeChallengeTestsMutation, selectedLanguageId, t]);

  // Submit solution
  const handleSubmit = useCallback(async () => {
    if (!code.trim()) {
      toast.error(t('noCodeToSubmit'));
      return;
    }

    setIsSubmitting(true);
    setTestResults(null);

    try {
      const submission = await submitCodeChallengeMutation.mutateAsync({
        sourceCode: btoa(code),
        languageId: selectedLanguageId,
      });
      const nextSubmissionId =
        typeof submission === 'object' && submission !== null && 'submission_uuid' in submission
          ? String(submission.submission_uuid)
          : submission.uuid;
      setActiveSubmissionId(nextSubmissionId);
      toast.info(t('submissionQueued'));
    } catch (error) {
      setIsSubmitting(false);
      toast.error(error instanceof Error ? error.message : t('submissionFailed'));
    }
  }, [code, selectedLanguageId, submitCodeChallengeMutation, t]);

  useEffect(() => {
    onSubmitControlChange?.({
      canSubmit: Boolean(code.trim()) && !isRunning && !isSubmitting,
      isSubmitting,
      submit: handleSubmit,
    });

    return () => onSubmitControlChange?.(null);
  }, [code, handleSubmit, isRunning, isSubmitting, onSubmitControlChange]);

  // Get language name from ID
  const getLanguageName = (languageId: number): string => {
    const lang = JUDGE0_LANGUAGES.find((l) => l.id === languageId);
    return lang?.name ?? `Language ${languageId}`;
  };

  // Get visible test cases - use visible_tests from settings
  const visibleTestCases = settings?.visible_tests ?? [];
  const visibleTestIds = new Set(visibleTestCases.map((tc: TestCase) => tc.id));

  return (
    <div className="flex h-full flex-col">
      {!hideHeader ? (
        <div className="flex items-center justify-between border-b p-4">
          <div>
            {challengeTitle && <h2 className="text-xl font-semibold">{challengeTitle}</h2>}
            {challengeDescription && <p className="text-muted-foreground mt-1 text-sm">{challengeDescription}</p>}
          </div>
          <div className="flex items-center gap-2">
            <LanguageSelector
              languages={JUDGE0_LANGUAGES}
              selectedId={selectedLanguageId}
              onSelect={setSelectedLanguageId}
              allowedLanguages={settings?.allowed_languages}
            />
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-end border-b p-3">
          <LanguageSelector
            languages={JUDGE0_LANGUAGES}
            selectedId={selectedLanguageId}
            onSelect={setSelectedLanguageId}
            allowedLanguages={settings?.allowed_languages}
          />
        </div>
      )}

      {/* Main Content */}
      <ResizablePanelGroup
        orientation="horizontal"
        className="flex-1"
      >
        {/* Editor Panel */}
        <ResizablePanel
          defaultSize={60}
          minSize={30}
        >
          <div className="flex h-full flex-col">
            <CodeEditor
              value={code}
              onChange={setCode}
              languageId={selectedLanguageId}
              className="flex-1"
            />

            {/* Editor Actions */}
            <div className="bg-muted/50 flex items-center justify-between border-t p-2">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRunTest}
                  disabled={isRunning || isSubmitting}
                >
                  {isRunning ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Terminal className="mr-2 h-4 w-4" />
                  )}
                  {t('runCode')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleTestAgainstSamples}
                  disabled={isRunning || isSubmitting || visibleTestCases.length === 0}
                >
                  <Play className="mr-2 h-4 w-4" />
                  {t('runTests')}
                </Button>
              </div>
              {!hideSubmitButton ? (
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={isRunning || isSubmitting}
                >
                  {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                  {t('submit')}
                </Button>
              ) : null}
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Results Panel */}
        <ResizablePanel
          defaultSize={40}
          minSize={25}
        >
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex h-full flex-col"
          >
            <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
              <TabsTrigger
                value="testcases"
                className="data-[state=active]:border-primary rounded-none border-b-2 border-transparent"
              >
                {t('testCases')}
              </TabsTrigger>
              <TabsTrigger
                value="custom"
                className="data-[state=active]:border-primary rounded-none border-b-2 border-transparent"
              >
                {t('customInput')}
              </TabsTrigger>
              <TabsTrigger
                value="results"
                className="data-[state=active]:border-primary rounded-none border-b-2 border-transparent"
              >
                {t('results')}
                {testResults && (
                  <Badge
                    variant="secondary"
                    className="ml-2"
                  >
                    {testResults.filter((r) => r.passed).length}/{testResults.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger
                value="history"
                className="data-[state=active]:border-primary rounded-none border-b-2 border-transparent"
              >
                <History className="mr-1 h-4 w-4" />
                {t('history')}
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="testcases"
              className="flex-1 overflow-hidden p-4"
            >
              <ScrollArea className="h-full">
                <div className="space-y-4 p-1">
                  {visibleTestCases.length === 0 ? (
                    <p className="text-muted-foreground text-center">{t('noVisibleTestCases')}</p>
                  ) : (
                    visibleTestCases.map((tc, index) => (
                      <Card key={`${tc.id ?? 'tc'}-${index}`}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm">
                            {t('testCase')} #{index + 1}
                            {tc.description && ` - ${tc.description}`}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div>
                            <div className="text-muted-foreground text-xs font-medium">{t('input')}:</div>
                            <pre className="bg-muted mt-1 overflow-x-auto rounded p-2 text-sm">
                              {tc.input || t('noInput')}
                            </pre>
                          </div>
                          <div>
                            <div className="text-muted-foreground text-xs font-medium">{t('expectedOutput')}:</div>
                            <pre className="bg-muted mt-1 overflow-x-auto rounded p-2 text-sm">
                              {tc.expected_output}
                            </pre>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent
              value="custom"
              className="flex flex-1 flex-col gap-4 overflow-hidden p-4"
            >
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium">{t('customInput')}</label>
                <Textarea
                  placeholder={t('enterCustomInput')}
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  className="h-32 resize-none font-mono text-sm"
                />
              </div>
              <Separator />
              <div className="flex-1 space-y-2">
                <label className="text-sm font-medium">{t('output')}</label>
                <ScrollArea className="bg-muted h-32 rounded border p-2">
                  <pre className="font-mono text-sm whitespace-pre-wrap">{customOutput || t('noOutput')}</pre>
                </ScrollArea>
              </div>
            </TabsContent>

            <TabsContent
              value="results"
              className="flex-1 overflow-hidden p-4"
            >
              <ScrollArea className="h-full">
                {isSubmitting && activeSubmission?.status === 'processing' ? (
                  <div className="flex flex-col items-center justify-center py-12">
                    <Loader2 className="text-primary h-8 w-8 animate-spin" />
                    <p className="text-muted-foreground mt-4">{t('runningTests')}</p>
                  </div>
                ) : testResults ? (
                  <TestResultsList
                    results={testResults}
                    visibleTestIds={visibleTestIds}
                    testCases={visibleTestCases}
                  />
                ) : (
                  <p className="text-muted-foreground text-center">{t('noResultsYet')}</p>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent
              value="history"
              className="flex-1 overflow-hidden p-4"
            >
              <ScrollArea className="h-full">
                <div className="space-y-2">
                  {!submissions?.length ? (
                    <p className="text-muted-foreground text-center">{t('noSubmissionsYet')}</p>
                  ) : (
                    <AttemptHistoryList
                      compact
                      title={t('history')}
                      items={submissions.map((submission: Submission, index: number) => ({
                        id: submission.submission_uuid ?? submission.uuid ?? index,
                        label: `Attempt ${submissions.length - index} · ${getLanguageName(submission.language_id)}`,
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
    </div>
  );
}

export default CodeChallengeEditor;

function normalizeCodeRunStatus(status: Submission['status'] | undefined) {
  return (status ?? '').toUpperCase();
}

function codeRunToSubmissionStatus(status: Submission['status']): SubmissionStatus {
  const normalized = normalizeCodeRunStatus(status);
  if (normalized === 'COMPLETED' || normalized === 'FAILED') return 'GRADED';
  return 'PENDING';
}
