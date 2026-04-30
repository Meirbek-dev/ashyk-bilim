'use client';

import { useCallback, useMemo, useState } from 'react';

import { CodeChallengeEditor, type CodeChallengeSubmitControl } from '@/components/features/courses/code-challenges';
import { Skeleton } from '@/components/ui/skeleton';
import { useCodeChallengeSettings } from '@/features/code-challenges/hooks/useCodeChallenge';
import { useAttemptShellControls } from '@/features/assessments/shell';
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
  const [submitControl, setSubmitControl] = useState<CodeChallengeSubmitControl | null>(null);

  const handleSubmitControlChange = useCallback((control: CodeChallengeSubmitControl | null) => {
    setSubmitControl(control);
  }, []);

  const primaryLanguageId = settings?.allowed_languages?.[0];
  const initialCode = primaryLanguageId !== undefined ? settings?.starter_code?.[String(primaryLanguageId)] ?? '' : '';
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

  if (isLoading) {
    return (
      <div className="space-y-4 p-6">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-[500px] w-full" />
      </div>
    );
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
    <div className="min-h-[650px] overflow-hidden rounded-lg border bg-card">
      <CodeChallengeEditor
        activityUuid={normalizedActivityUuid}
        settings={settings}
        initialCode={initialCode}
        initialLanguageId={primaryLanguageId ?? 71}
        challengeTitle={vm?.title}
        challengeDescription={vm?.description ?? undefined}
        hideHeader
        onSubmitControlChange={handleSubmitControlChange}
      />
    </div>
  );
}
