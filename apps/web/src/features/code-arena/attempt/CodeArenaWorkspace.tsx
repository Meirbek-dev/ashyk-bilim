'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from '@/components/ui/command';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import {
  useCodeChallengeSubmissions,
  useJudge0Languages,
  useRunCodeChallengeTests,
  useRunCustomTest,
} from '@/features/assessments/hooks/code-challenge';
import type { CodeChallengeSubmitControl } from '@/components/features/courses/code-challenges';
import type { ItemAnswer } from '@/features/assessments/domain/items';
import { cn } from '@/lib/utils';
import type {
  CodeAnswer,
  CodeArenaTab,
  CodeChallengeProblem,
  CodeChallengeSettings,
  CodeResultTab,
  CodeVerdict,
  TestCaseResult,
} from '../domain';
import { normalizeStarterCode, verdictFromResults, verdictFromRun } from '../domain';
import { useEditorPreferences } from '../hooks';
import { EditorPane } from './EditorPane';
import { ProblemPane } from './ProblemPane';
import { ResultsDock } from './ResultsDock';
import { CodeArenaHeader } from './CodeArenaHeader';
import { HintDrawer } from './HintDrawer';

interface CodeArenaWorkspaceProps {
  problem: CodeChallengeProblem;
  settings: CodeChallengeSettings;
  answer?: CodeAnswer;
  initialLanguageId: number;
  initialCode: string;
  disabled?: boolean;
  onAnswerChange: (answer: Extract<ItemAnswer, { kind: 'CODE' }>) => void;
  onSubmit: () => Promise<void> | void;
  onSubmitControlChange?: (control: CodeChallengeSubmitControl | null) => void;
}

export function CodeArenaWorkspace({
  problem,
  settings,
  answer,
  initialLanguageId,
  initialCode,
  disabled = false,
  onAnswerChange,
  onSubmit,
  onSubmitControlChange,
}: CodeArenaWorkspaceProps) {
  const t = useTranslations('Activities.CodeChallenges');
  const [problemTab, setProblemTab] = useState<CodeArenaTab>('description');
  const [resultTab, setResultTab] = useState<CodeResultTab>('testcase');
  const [commandOpen, setCommandOpen] = useState(false);
  const [hintsOpen, setHintsOpen] = useState(false);
  const [codeByLanguage, setCodeByLanguage] = useState<Record<number, string>>(() =>
    initialLanguageId > 0 ? { [initialLanguageId]: answer?.source ?? initialCode } : {},
  );
  const [languageId, setLanguageId] = useState(answer?.language ?? initialLanguageId);
  const [code, setCode] = useState(answer?.source ?? initialCode);
  const [customInput, setCustomInput] = useState('');
  const [consoleOutput, setConsoleOutput] = useState('');
  const [results, setResults] = useState<TestCaseResult[] | null>(null);
  const [verdict, setVerdict] = useState<CodeVerdict | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { preferences, setPreferences, monacoOptions } = useEditorPreferences();
  const { data: judge0Languages = [] } = useJudge0Languages();
  const { data: submissionsData } = useCodeChallengeSubmissions(problem.activityUuid);
  const runCustom = useRunCustomTest(problem.activityUuid);
  const runTests = useRunCodeChallengeTests(problem.activityUuid);
  const submissions = Array.isArray(submissionsData) ? submissionsData : [];
  const allowedLanguages = useMemo(() => settings.allowed_languages ?? [], [settings.allowed_languages]);
  const languages = useMemo(
    () =>
      allowedLanguages.length
        ? judge0Languages.filter((language) => allowedLanguages.includes(language.id))
        : judge0Languages,
    [allowedLanguages, judge0Languages],
  );
  const isRunning = runCustom.isPending || runTests.isPending || isSubmitting;
  const starterCode = normalizeStarterCode(settings, languageId);

  useEffect(() => {
    if (answer?.source !== undefined && answer.source !== code) {
      setCode(answer.source);
      setCodeByLanguage((current) => ({ ...current, [answer.language]: answer.source }));
    }
  }, [answer?.language, answer?.source, code]);

  useEffect(() => {
    if (languageId > 0 || languages.length === 0) return;
    const nextLanguageId = languages[0]!.id;
    setLanguageId(nextLanguageId);
    setCode(normalizeStarterCode(settings, nextLanguageId));
  }, [languageId, languages, settings]);

  const updateAnswer = useCallback(
    (nextLanguageId: number, nextCode: string) => {
      onAnswerChange({ kind: 'CODE', language: nextLanguageId, source: nextCode, latest_run: answer?.latest_run });
    },
    [answer?.latest_run, onAnswerChange],
  );

  const updateCode = useCallback(
    (nextCode: string) => {
      setCode(nextCode);
      setCodeByLanguage((current) => ({ ...current, [languageId]: nextCode }));
      updateAnswer(languageId, nextCode);
    },
    [languageId, updateAnswer],
  );

  const updateLanguage = useCallback(
    (nextLanguageId: number) => {
      const nextCode = codeByLanguage[nextLanguageId] ?? normalizeStarterCode(settings, nextLanguageId);
      setLanguageId(nextLanguageId);
      setCode(nextCode);
      updateAnswer(nextLanguageId, nextCode);
    },
    [codeByLanguage, settings, updateAnswer],
  );

  const handleRunCustom = useCallback(async () => {
    if (!code.trim()) {
      toast.error('Write code before running it.');
      return;
    }
    setResultTab('console');
    setConsoleOutput('');
    try {
      const result = await runCustom.mutateAsync({ sourceCode: code, languageId, stdin: customInput });
      const output = result.compile_output || result.stderr || result.stdout || 'Program finished with no output.';
      setConsoleOutput(output);
      setVerdict(verdictFromRun(result.status_description, result.status === 3 ? 1 : 0, 1));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Code execution failed.';
      setConsoleOutput(message);
      setVerdict('DEGRADED');
      toast.error(message);
    }
  }, [code, customInput, languageId, runCustom]);

  const handleRunTests = useCallback(async () => {
    if (!code.trim()) {
      toast.error('Write code before running tests.');
      return;
    }
    setResultTab('result');
    setResults(null);
    setVerdict('RUNNING');
    try {
      const result = await runTests.mutateAsync({ sourceCode: code, languageId });
      setResults(result.results);
      setVerdict(verdictFromResults(result.results));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Test run failed.';
      setVerdict('DEGRADED');
      toast.error(message);
    }
  }, [code, languageId, runTests]);

  const handleSubmit = useCallback(async () => {
    if (!code.trim()) {
      toast.error('Write code before submitting.');
      return;
    }
    setIsSubmitting(true);
    try {
      updateAnswer(languageId, code);
      await onSubmit();
      toast.success('Submission queued.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Submission failed.');
    } finally {
      setIsSubmitting(false);
    }
  }, [code, languageId, onSubmit, updateAnswer]);

  const submitControl = useMemo<CodeChallengeSubmitControl>(
    () => ({
      canSubmit: !disabled && languageId > 0 && Boolean(code.trim()) && !isRunning,
      isSubmitting,
      submit: handleSubmit,
    }),
    [code, disabled, handleSubmit, isRunning, isSubmitting, languageId],
  );

  useEffect(() => {
    onSubmitControlChange?.(submitControl);
  }, [onSubmitControlChange, submitControl]);

  useEffect(() => () => onSubmitControlChange?.(null), [onSubmitControlChange]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;
      if (!mod) return;
      if (event.key === 'Enter' && event.shiftKey) {
        event.preventDefault();
        void handleSubmit();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        void handleRunTests();
      } else if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
  }, [handleRunTests, handleSubmit]);

  return (
    <div className="bg-background flex h-full min-h-0 flex-col">
      <CodeArenaHeader
        problem={problem}
        verdict={verdict}
        isRunning={isRunning}
        onRunCustom={handleRunCustom}
        onRunTests={handleRunTests}
        onSubmit={handleSubmit}
        disabled={disabled}
      />

      <ResizablePanelGroup
        id="code-arena-main-layout"
        orientation="horizontal"
        className="min-h-0 flex-1"
      >
        <ResizablePanel
          defaultSize={34}
          minSize={24}
          className={cn('min-w-0')}
        >
          <ProblemPane
            problem={problem}
            settings={settings}
            submissions={submissions}
            activeTab={problemTab}
            onTabChange={(tab) => {
              if (tab === 'hints') {
                setHintsOpen(true);
              } else {
                setProblemTab(tab);
              }
            }}
            onUseInput={(input) => {
              setCustomInput(input);
              setResultTab('testcase');
            }}
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel
          defaultSize={66}
          minSize={42}
        >
          <ResizablePanelGroup
            id="code-arena-editor-results-layout"
            orientation="vertical"
            className="h-full"
          >
            <ResizablePanel
              defaultSize={65}
              minSize={35}
            >
              <EditorPane
                code={code}
                onCodeChange={updateCode}
                languageId={languageId}
                onLanguageChange={updateLanguage}
                languages={languages}
                allowedLanguages={allowedLanguages}
                readOnly={disabled}
                starterCode={starterCode}
                preferences={preferences}
                onPreferencesChange={setPreferences}
                monacoOptions={monacoOptions}
              />
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel
              defaultSize={35}
              minSize={20}
            >
              <ResultsDock
                activeTab={resultTab}
                onTabChange={setResultTab}
                customInput={customInput}
                onCustomInputChange={setCustomInput}
                consoleOutput={consoleOutput}
                results={results}
                verdict={verdict}
              />
            </ResizablePanel>
          </ResizablePanelGroup>
        </ResizablePanel>
      </ResizablePanelGroup>

      <CommandDialog
        open={commandOpen}
        onOpenChange={setCommandOpen}
        title="Code command palette"
      >
        <CommandInput placeholder="Run, submit, reset..." />
        <CommandList>
          <CommandEmpty>{t('noCommandFound')}</CommandEmpty>
          <CommandGroup heading="Actions">
            <CommandItem
              onSelect={() => {
                setCommandOpen(false);
                void handleRunTests();
              }}
            >
              {t('runVisibleTests')}
              <CommandShortcut>{t('ctrlEnter')}</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setCommandOpen(false);
                void handleSubmit();
              }}
            >
              {t('submitSolution')}
              <CommandShortcut>{t('ctrlShiftEnter')}</CommandShortcut>
            </CommandItem>
            <CommandItem
              onSelect={() => {
                setCommandOpen(false);
                updateCode(starterCode);
              }}
            >
              {t('resetToStarterCode')}
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
      <HintDrawer
        open={hintsOpen}
        onOpenChange={setHintsOpen}
        hints={settings.hints ?? []}
      />
    </div>
  );
}
