'use client';

import { useCallback, useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';

import { CodeItemLoading, useCodeSubmitControl } from '@/features/assessments/items/code';
import type { AssessmentItem, ItemAnswer } from '@/features/assessments/domain/items';
import { useAssessmentSubmission } from '@/features/assessments/hooks/useAssessmentSubmission';
import { useAttemptShellControls } from '@/features/assessments/shell';
import type { AttemptSaveState } from '@/features/assessments/shell';
import { CodeArenaWorkspace } from '@/features/code-arena/attempt';
import { codeItemToProblem } from '@/features/code-arena/domain';
import type { CodeChallengeSettings } from '@/services/courses/code-challenges';
import type { KindAttemptProps } from '../index';

interface CodeChallengeTestCase {
  id: string;
  input: string;
  expected_output: string;
  description?: string;
  is_visible: boolean;
  weight?: number;
  match_mode?: 'EXACT' | 'TRIMMED' | 'IGNORE_WHITESPACE' | 'NUMERIC_TOLERANCE' | 'CUSTOM_CHECKER';
}

export default function CodeChallengeAttemptContent({ activityUuid, vm }: KindAttemptProps) {
  const t = useTranslations('Activities.CodeChallenges');
  const normalizedActivityUuid = activityUuid.replace(/^activity_/, '');
  const assessmentUuid = vm?.assessmentUuid ?? null;
  const codeItem = useMemo(() => vm?.items.find((item) => item.body.kind === 'CODE') ?? null, [vm?.items]);
  const settings = useMemo(
    () => (codeItem ? codeItemToSettings(codeItem, vm?.title, vm?.description ?? undefined) : null),
    [codeItem, vm?.description, vm?.title],
  );
  const submissionState = useAssessmentSubmission(assessmentUuid, normalizedActivityUuid);
  const saveDraft = submissionState.save;
  const { saveState } = submissionState;
  const submissionStatus = submissionState.status;
  const submitAssessment = submissionState.submit;
  const { submitControl, handleSubmitControlChange } = useCodeSubmitControl();

  const primaryLanguageId = settings?.allowed_languages?.[0];
  const savedAnswer = codeItem ? submissionState.answers[codeItem.item_uuid] : undefined;
  const codeAnswer = savedAnswer?.kind === 'CODE' ? savedAnswer : undefined;
  const initialCode =
    primaryLanguageId !== undefined ? (settings?.starter_code?.[String(primaryLanguageId)] ?? '') : '';
  const isConfigured = Boolean(settings?.allowed_languages?.length);
  const problem = useMemo(
    () =>
      codeItem && settings
        ? codeItemToProblem({
            activityUuid: normalizedActivityUuid,
            item: codeItem,
            settings,
            title: vm?.title,
            description: vm?.description,
          })
        : null,
    [codeItem, normalizedActivityUuid, settings, vm?.description, vm?.title],
  );

  const shellControls = useMemo(
    () => ({
      saveState: mapSaveState(submissionState.saveState, submissionState.status),
      status: submissionState.status,
      canSave: Boolean(vm?.canSaveDraft) && submissionState.saveState === 'dirty',
      canSubmit: Boolean(vm?.canSubmit && submitControl?.canSubmit),
      isSaving: submissionState.isSaving,
      isSubmitting: submissionState.isSubmitting || Boolean(submitControl?.isSubmitting),
      onSave:
        Boolean(vm?.canSaveDraft) && submissionState.saveState === 'dirty' ? () => submissionState.save() : undefined,
      onSubmit: vm?.canSubmit && submitControl?.canSubmit ? submitControl.submit : undefined,
      conflict: submissionState.conflict
        ? {
            open: true,
            latestVersion: submissionState.conflict.latestVersion,
            latestSavedAt: submissionState.conflict.latestSavedAt,
            localAnswerCount: submissionState.conflict.localAnswerCount,
            serverAnswerCount: submissionState.conflict.serverAnswerCount,
            onKeepLocalVersion: submissionState.conflict.onKeepLocalVersion,
            onUseServerVersion: submissionState.conflict.onUseServerVersion,
          }
        : null,
    }),
    [submissionState, submitControl, vm?.canSaveDraft, vm?.canSubmit],
  );
  useAttemptShellControls(shellControls);

  useEffect(() => {
    if (!codeItem || !submissionState.draft || codeAnswer) return;
    submissionState.setItemAnswer(codeItem.item_uuid, {
      kind: 'CODE',
      language: primaryLanguageId ?? 0,
      source: initialCode,
    });
  }, [codeAnswer, codeItem, initialCode, primaryLanguageId, submissionState]);

  useEffect(() => {
    if (submissionStatus !== 'DRAFT' || saveState !== 'dirty') return;
    const timeout = setTimeout(() => {
      saveDraft();
    }, 1000);
    return () => clearTimeout(timeout);
  }, [saveDraft, saveState, submissionStatus]);

  const handleCanonicalSubmit = useCallback(async () => {
    await submitAssessment();
  }, [submitAssessment]);

  if (submissionState.isLoading) {
    return <CodeItemLoading />;
  }

  if (!codeItem || !settings || !problem || !isConfigured) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <h3 className="text-lg font-semibold">{t('notConfigured')}</h3>
        <p className="text-muted-foreground mt-2 max-w-md text-sm">{t('notConfiguredDescription')}</p>
      </div>
    );
  }

  return (
    <CodeArenaWorkspace
      problem={problem}
      settings={settings}
      answer={codeAnswer}
      disabled={!vm?.canEdit}
      initialCode={codeAnswer?.source ?? initialCode}
      initialLanguageId={codeAnswer?.language ?? primaryLanguageId ?? 0}
      onSubmitControlChange={handleSubmitControlChange}
      onSubmit={handleCanonicalSubmit}
      onAnswerChange={(answer) => {
        submissionState.setItemAnswer(codeItem.item_uuid, answer);
      }}
    />
  );
}

function codeItemToSettings(
  item: AssessmentItem,
  title?: string | null,
  description?: string | null,
): CodeChallengeSettings | null {
  if (item.body.kind !== 'CODE') return null;
  const visibleTests = item.body.tests.filter((test) => test.is_visible).map(toCodeChallengeTestCase);
  const hiddenTests = item.body.tests.filter((test) => !test.is_visible).map(toCodeChallengeTestCase);
  const timeLimit = item.body.time_limit_seconds ?? 5;
  const memoryLimit = item.body.memory_limit_mb ?? 256;

  return {
    uuid: item.item_uuid,
    title: title ?? item.title,
    prompt: item.body.prompt || description || '',
    input_spec: item.body.input_spec ?? '',
    output_spec: item.body.output_spec ?? '',
    constraints: item.body.constraints ?? [],
    time_limit: timeLimit,
    memory_limit: memoryLimit,
    time_limit_ms: timeLimit * 1000,
    memory_limit_kb: memoryLimit * 1024,
    grading_strategy: 'PARTIAL_CREDIT',
    allowed_languages: item.body.languages,
    visible_tests: visibleTests,
    hidden_tests: hiddenTests,
    starter_code: item.body.starter_code,
    reference_solutions: item.body.reference_solutions ?? {},
  };
}

function toCodeChallengeTestCase(test: {
  id: string;
  input: string;
  expected_output: string;
  description?: string | null;
  is_visible: boolean;
  weight: number;
  match_mode?: 'EXACT' | 'TRIMMED' | 'IGNORE_WHITESPACE' | 'NUMERIC_TOLERANCE' | 'CUSTOM_CHECKER';
}): CodeChallengeTestCase {
  return {
    id: test.id,
    input: test.input,
    expected_output: test.expected_output,
    description: test.description ?? undefined,
    is_visible: test.is_visible,
    weight: test.weight,
    match_mode: test.match_mode ?? 'EXACT',
  };
}

function mapSaveState(
  saveState: 'idle' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'error',
  status: string | null,
): AttemptSaveState {
  if (status === 'PENDING') return 'submitted';
  if (status === 'RETURNED') return 'returned';
  switch (saveState) {
    case 'dirty': {
      return 'unsaved';
    }
    case 'saving': {
      return 'saving';
    }
    case 'error':
    case 'conflict': {
      return 'error';
    }
    default: {
      return 'saved';
    }
  }
}
