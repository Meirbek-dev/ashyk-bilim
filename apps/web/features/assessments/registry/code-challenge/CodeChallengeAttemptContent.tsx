'use client';

import { useEffect, useMemo, useRef } from 'react';

import { CodeItemAttempt, CodeItemLoading, useCodeSubmitControl } from '@/features/assessments/items/code';
import { useCodeChallengeSettings } from '@/features/code-challenges/hooks/useCodeChallenge';
import { useAttemptShellControls } from '@/features/assessments/shell';
import { startCodeChallenge } from '@/services/courses/code-challenges';
import type { KindAttemptProps } from '../index';

interface CodeChallengeTestCase {
  id: string;
  input: string;
  expected_output: string;
  description?: string;
  is_visible: boolean;
  weight?: number;
}

interface CodeChallengeActivitySettings {
  uuid?: string;
  time_limit_ms: number;
  memory_limit_kb: number;
  time_limit: number;
  memory_limit: number;
  max_submissions?: number;
  grading_strategy: string;
  allowed_languages: number[];
  visible_tests: CodeChallengeTestCase[];
  hidden_tests?: CodeChallengeTestCase[];
  starter_code?: Record<string, string>;
}

export default function CodeChallengeAttemptContent({ activityUuid, vm }: KindAttemptProps) {
  const normalizedActivityUuid = activityUuid.replace(/^activity_/, '');
  const { data: settings, isLoading } = useCodeChallengeSettings<CodeChallengeActivitySettings>(normalizedActivityUuid);
  const { submitControl, handleSubmitControlChange } = useCodeSubmitControl();
  const startedRef = useRef<string | null>(null);

  const primaryLanguageId = settings?.allowed_languages?.[0];
  const initialCode =
    primaryLanguageId !== undefined ? (settings?.starter_code?.[String(primaryLanguageId)] ?? '') : '';
  const isConfigured = Boolean(settings?.allowed_languages?.length);

  const shellControls = useMemo(
    () => ({
      saveState: submitControl?.isSubmitting ? ('saving' as const) : ('saved' as const),
      canSave: false,
      canSubmit: Boolean(submitControl?.canSubmit),
      isSaving: false,
      isSubmitting: Boolean(submitControl?.isSubmitting),
      onSubmit: submitControl?.submit,
    }),
    [submitControl],
  );
  useAttemptShellControls(shellControls);

  useEffect(() => {
    if (!isConfigured || startedRef.current === normalizedActivityUuid) return;

    startedRef.current = normalizedActivityUuid;
    void startCodeChallenge(normalizedActivityUuid).catch(() => {
      startedRef.current = null;
    });
  }, [isConfigured, normalizedActivityUuid]);

  if (isLoading) {
    return <CodeItemLoading />;
  }

  if (!settings || !isConfigured) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-16 text-center">
        <h3 className="text-lg font-semibold">Code challenge is not configured</h3>
        <p className="text-muted-foreground mt-2 max-w-md text-sm">
          The challenge needs at least one allowed language before students can submit.
        </p>
      </div>
    );
  }

  return (
    <CodeItemAttempt
      item={{
        activityUuid: normalizedActivityUuid,
        settings,
        initialCode,
        initialLanguageId: primaryLanguageId ?? 71,
        title: vm?.title,
        description: vm?.description ?? undefined,
        onSubmitControlChange: handleSubmitControlChange,
      }}
      answer={undefined}
      onAnswerChange={() => undefined}
    />
  );
}
