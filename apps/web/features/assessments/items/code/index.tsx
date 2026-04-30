'use client';

import { useCallback, useState } from 'react';

import { CodeChallengeEditor } from '@/components/features/courses/code-challenges';
import type { CodeChallengeSubmitControl } from '@/components/features/courses/code-challenges';
import { Skeleton } from '@/components/ui/skeleton';
import { registerItemKind, UnsupportedItemAuthor } from '../registry';
import type { ItemAttemptProps, ItemReviewDetailProps } from '../registry';

export interface CodeItemSettings {
  uuid?: string;
  time_limit_ms: number;
  memory_limit_kb: number;
  time_limit: number;
  memory_limit: number;
  max_submissions?: number;
  grading_strategy: string;
  allowed_languages: number[];
  visible_tests: {
    id: string;
    input: string;
    expected_output: string;
    description?: string;
    is_visible: boolean;
    weight?: number;
  }[];
  hidden_tests?: {
    id: string;
    input: string;
    expected_output: string;
    description?: string;
    is_visible: boolean;
    weight?: number;
  }[];
  starter_code?: Record<string, string>;
}

export interface CodeAttemptItem {
  activityUuid: string;
  title?: string;
  description?: string;
  settings: CodeItemSettings;
  initialCode?: string;
  initialLanguageId: number;
  onSubmitControlChange?: (control: CodeChallengeSubmitControl | null) => void;
}

export function CodeItemAttempt({ item }: ItemAttemptProps<CodeAttemptItem>) {
  return (
    <div className="bg-card min-h-[650px] overflow-hidden rounded-md border">
      <CodeChallengeEditor
        activityUuid={item.activityUuid}
        settings={item.settings}
        initialCode={item.initialCode}
        initialLanguageId={item.initialLanguageId}
        challengeTitle={item.title}
        challengeDescription={item.description}
        hideHeader
        onSubmitControlChange={item.onSubmitControlChange}
      />
    </div>
  );
}

export function CodeItemLoading() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-[500px] w-full" />
    </div>
  );
}

export function useCodeSubmitControl() {
  const [submitControl, setSubmitControl] = useState<CodeChallengeSubmitControl | null>(null);
  const handleSubmitControlChange = useCallback((control: CodeChallengeSubmitControl | null) => {
    setSubmitControl(control);
  }, []);
  return { submitControl, handleSubmitControlChange };
}

export function CodeItemReviewDetail({ answer }: ItemReviewDetailProps<CodeAttemptItem>) {
  return (
    <pre className="bg-muted max-h-96 overflow-auto rounded-md p-3 text-xs">
      {JSON.stringify(answer ?? {}, null, 2)}
    </pre>
  );
}

registerItemKind({
  kind: 'CODE',
  label: 'Code',
  Author: UnsupportedItemAuthor,
  Attempt: CodeItemAttempt,
  ReviewDetail: CodeItemReviewDetail,
});
