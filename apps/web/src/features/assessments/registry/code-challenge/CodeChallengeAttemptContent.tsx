'use client';

import { useEffect, useMemo } from 'react';
import { useTranslations } from 'next-intl';

import { CodeItemAttempt, CodeItemLoading, useCodeSubmitControl } from '@/features/assessments/items/code';
import type { CodeItemSettings } from '@/features/assessments/items/code';
import type { AssessmentItem, ItemAnswer } from '@/features/assessments/domain/items';
import { useAssessmentSubmission } from '@/features/assessments/hooks/useAssessmentSubmission';
import { useAttemptShellControls } from '@/features/assessments/shell';
import type { AttemptSaveState } from '@/features/assessments/shell';
import type { KindAttemptProps } from '../index';

interface CodeChallengeTestCase {
  id: string;
  input: string;
  expected_output: string;
  description?: string;
  is_visible: boolean;
  weight?: number;
}

export default function CodeChallengeAttemptContent({ activityUuid, vm }: KindAttemptProps) {
  const t = useTranslations('Activities.CodeChallenges');
  const normalizedActivityUuid = activityUuid.replace(/^activity_/, '');
  const assessmentUuid = vm?.assessmentUuid ?? null;
  const codeItem = useMemo(() => vm?.items.find((item) => item.body.kind === 'CODE') ?? null, [vm?.items]);
  const settings = useMemo(() => (codeItem ? codeItemToSettings(codeItem) : null), [codeItem]);
  const submissionState = useAssessmentSubmission(assessmentUuid, normalizedActivityUuid);
  const { submitControl, handleSubmitControlChange } = useCodeSubmitControl();

  const primaryLanguageId = settings?.allowed_languages?.[0];
  const savedAnswer = codeItem ? submissionState.answers[codeItem.item_uuid] : undefined;
  const codeAnswer = savedAnswer?.kind === 'CODE' ? savedAnswer : undefined;
  const initialCode =
    primaryLanguageId !== undefined ? (settings?.starter_code?.[String(primaryLanguageId)] ?? '') : '';
  const isConfigured = Boolean(settings?.allowed_languages?.length);

  const shellControls = useMemo(
    () => ({
      saveState: mapSaveState(submissionState.saveState, submissionState.status),
      status: submissionState.status,
      canSave: Boolean(vm?.canSaveDraft) && submissionState.saveState === 'dirty',
      canSubmit: Boolean(vm?.canSubmit && submitControl?.canSubmit),
      isSaving: submissionState.isSaving,
      isSubmitting: submissionState.isSubmitting || Boolean(submitControl?.isSubmitting),
      onSave:
        Boolean(vm?.canSaveDraft) && submissionState.saveState === 'dirty'
          ? () => void submissionState.save()
          : undefined,
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
    if (submissionState.status !== 'DRAFT' || submissionState.saveState !== 'dirty') return;
    const timeout = setTimeout(() => {
      void submissionState.save();
    }, 1000);
    return () => clearTimeout(timeout);
  }, [submissionState]);

  const handleCanonicalSubmit = useMemo(
    () => async () => {
      await submissionState.submit();
    },
    [submissionState],
  );

  if (submissionState.isLoading) {
    return <CodeItemLoading />;
  }

  if (!codeItem || !settings || !isConfigured) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <h3 className="text-lg font-semibold">{t('notConfigured')}</h3>
        <p className="text-muted-foreground mt-2 max-w-md text-sm">{t('notConfiguredDescription')}</p>
      </div>
    );
  }

  return (
    <CodeItemAttempt
      item={{
        activityUuid: normalizedActivityUuid,
        settings,
        initialCode: codeAnswer?.source ?? initialCode,
        initialLanguageId: codeAnswer?.language ?? primaryLanguageId ?? 0,
        title: vm?.title,
        description: vm?.description ?? undefined,
        onSubmitControlChange: handleSubmitControlChange,
        onSubmit: handleCanonicalSubmit,
      }}
      answer={codeAnswer}
      disabled={!vm?.canEdit}
      onAnswerChange={(answer) => {
        submissionState.setItemAnswer(codeItem.item_uuid, answer as ItemAnswer);
      }}
    />
  );
}

function codeItemToSettings(item: AssessmentItem): CodeItemSettings | null {
  if (item.body.kind !== 'CODE') return null;
  const visibleTests = item.body.tests.filter((test) => test.is_visible).map(toCodeChallengeTestCase);
  const hiddenTests = item.body.tests.filter((test) => !test.is_visible).map(toCodeChallengeTestCase);
  const timeLimit = item.body.time_limit_seconds ?? 5;
  const memoryLimit = item.body.memory_limit_mb ?? 256;

  return {
    uuid: item.item_uuid,
    time_limit: timeLimit,
    memory_limit: memoryLimit,
    time_limit_ms: timeLimit * 1000,
    memory_limit_kb: memoryLimit * 1024,
    grading_strategy: 'PARTIAL_CREDIT',
    allowed_languages: item.body.languages,
    visible_tests: visibleTests,
    hidden_tests: hiddenTests,
    starter_code: item.body.starter_code,
  };
}

function toCodeChallengeTestCase(test: {
  id: string;
  input: string;
  expected_output: string;
  description?: string | null;
  is_visible: boolean;
  weight: number;
}): CodeChallengeTestCase {
  return {
    id: test.id,
    input: test.input,
    expected_output: test.expected_output,
    description: test.description ?? undefined,
    is_visible: test.is_visible,
    weight: test.weight,
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
