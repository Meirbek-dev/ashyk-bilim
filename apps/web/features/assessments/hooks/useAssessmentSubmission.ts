'use client';

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/api-client';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { reportClientError } from '@/services/telemetry/client';
import type { ItemAnswer } from '../domain/items';

export interface AssessmentSubmissionRead {
  submission_uuid: string;
  created_at: string;
  answers_json: { answers?: Record<string, ItemAnswer> } | Record<string, unknown>;
  status: 'DRAFT' | 'PENDING' | 'GRADED' | 'PUBLISHED' | 'RETURNED';
  version: number;
  updated_at: string;
  submitted_at?: string | null;
  final_score?: number | null;
  auto_score?: number | null;
  grading_json?: {
    feedback?: string;
  } | null;
}

interface DraftRead {
  assessment_uuid: string;
  submission: AssessmentSubmissionRead | null;
}

interface SubmitOptions {
  violationCount?: number;
}

interface ConflictState {
  latest: AssessmentSubmissionRead;
  localAnswers: Record<string, ItemAnswer>;
}

export type AssessmentSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'error';

function answersFromSubmission(submission: AssessmentSubmissionRead | null | undefined): Record<string, ItemAnswer> {
  const answers = submission?.answers_json?.answers;
  return answers && typeof answers === 'object' ? (answers as Record<string, ItemAnswer>) : {};
}

async function readJsonOrThrow(response: Response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      typeof payload?.detail === 'string'
        ? payload.detail
        : typeof payload?.detail?.message === 'string'
          ? payload.detail.message
          : response.statusText || 'Request failed';
    const error = new Error(message) as Error & { status?: number; payload?: any };
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export function useAssessmentSubmission(assessmentUuid: string | null | undefined) {
  const queryClient = useQueryClient();
  const [localAnswers, setLocalAnswers] = useState<Record<string, ItemAnswer>>({});
  const [saveState, setSaveState] = useState<AssessmentSaveState>('idle');
  const [conflictState, setConflictState] = useState<ConflictState | null>(null);
  const [reportedLoadError, setReportedLoadError] = useState<string | null>(null);
  const localAnswersRef = useRef<Record<string, ItemAnswer>>({});
  const submissionsQueryKey = useMemo(
    () => ['assessments', 'submissions', 'me', assessmentUuid || 'missing'] as const,
    [assessmentUuid],
  );

  const draftQueryOptions = useMemo(
    () =>
      queryOptions({
        queryKey: queryKeys.assessments.draft(assessmentUuid),
        queryFn: async () => {
          const response = await apiFetch(`assessments/${assessmentUuid}/draft`);
           return (await readJsonOrThrow(response)) as DraftRead;
        },
      }),
    [assessmentUuid],
  );

  const draftQuery = useQuery({
    ...draftQueryOptions,
    enabled: Boolean(assessmentUuid),
  });

  const submissionsQuery = useQuery({
    ...queryOptions({
      queryKey: submissionsQueryKey,
      queryFn: async () => {
        const response = await apiFetch(`assessments/${assessmentUuid}/me`);
        return (await readJsonOrThrow(response)) as AssessmentSubmissionRead[];
      },
      enabled: Boolean(assessmentUuid),
    }),
  });

  const draft = draftQuery.data?.submission ?? null;
  const submission = draft ?? submissionsQuery.data?.[0] ?? null;
  const version = submission?.version;

  useEffect(() => {
    localAnswersRef.current = localAnswers;
  }, [localAnswers]);

  const syncLatestSubmission = useCallback(
    (latest: AssessmentSubmissionRead) => {
      if (!assessmentUuid) return;

      queryClient.setQueryData(draftQueryOptions.queryKey, {
        assessment_uuid: assessmentUuid,
        submission: latest.status === 'DRAFT' ? latest : null,
      } satisfies DraftRead);

      queryClient.setQueryData(submissionsQueryKey, (current: AssessmentSubmissionRead[] | undefined) => {
        const next = [...(current ?? [])];
        const existingIndex = next.findIndex((candidate) => candidate.submission_uuid === latest.submission_uuid);
        if (existingIndex >= 0) {
          next[existingIndex] = latest;
        } else {
          next.unshift(latest);
        }
        next.sort((left, right) => {
          const leftTime = new Date(left.created_at ?? left.updated_at).getTime();
          const rightTime = new Date(right.created_at ?? right.updated_at).getTime();
          return rightTime - leftTime;
        });
        return next;
      });
    },
    [assessmentUuid, draftQueryOptions.queryKey, queryClient, submissionsQueryKey],
  );

  const openConflict = useCallback(
    (latest: AssessmentSubmissionRead) => {
      syncLatestSubmission(latest);
      setConflictState({
        latest,
        localAnswers: cloneAnswers(localAnswersRef.current),
      });
      setSaveState('conflict');
    },
    [syncLatestSubmission],
  );

  const saveMutation = useMutation({
    mutationFn: async (answers: Record<string, ItemAnswer>) => {
      if (!assessmentUuid) throw new Error('Assessment is not ready');
      const response = await apiFetch(`assessments/${assessmentUuid}/draft`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(version ? { 'If-Match': String(version) } : {}),
        },
        body: JSON.stringify({
          answers: Object.entries(answers).map(([item_uuid, answer]) => ({ item_uuid, answer })),
        }),
      });
      return (await readJsonOrThrow(response)) as AssessmentSubmissionRead;
    },
    onMutate: () => setSaveState('saving'),
    onSuccess: async () => {
      setConflictState(null);
      setSaveState('saved');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: draftQueryOptions.queryKey }),
        queryClient.invalidateQueries({ queryKey: submissionsQueryKey }),
      ]);
    },
    onError: (error: Error & { status?: number; payload?: any }) => {
      if (error.status === 409) {
        const latest = error.payload?.detail?.latest as AssessmentSubmissionRead | undefined;
        if (latest) {
          openConflict(latest);
        }
        toast.error('Your draft changed in another tab. Choose whether to keep your local version or load the latest saved draft.');
        return;
      }
      setSaveState('error');
      void reportClientError({
        scope: 'assessment-flow',
        phase: 'save-draft',
        assessmentUuid,
        error: error.message || 'Failed to save draft',
      }).catch(() => undefined);
      toast.error(error.message || 'Failed to save draft');
    },
  });

  const submitMutation = useMutation({
    mutationFn: async ({
      answers,
      violationCount,
    }: {
      answers: Record<string, ItemAnswer>;
      violationCount?: number;
    }) => {
      if (!assessmentUuid) throw new Error('Assessment is not ready');
      const params = new URLSearchParams();
      if (typeof violationCount === 'number' && violationCount > 0) {
        params.set('violation_count', String(violationCount));
      }
      const suffix = params.size > 0 ? `?${params.toString()}` : '';
      const response = await apiFetch(`assessments/${assessmentUuid}/submit${suffix}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(version ? { 'If-Match': String(version) } : {}),
        },
        body: JSON.stringify({
          answers: Object.entries(answers).map(([item_uuid, answer]) => ({ item_uuid, answer })),
        }),
      });
      return (await readJsonOrThrow(response)) as AssessmentSubmissionRead;
    },
    onSuccess: async () => {
      setConflictState(null);
      setSaveState('saved');
      if (assessmentUuid) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: draftQueryOptions.queryKey }),
          queryClient.invalidateQueries({ queryKey: submissionsQueryKey }),
          queryClient.invalidateQueries({ queryKey: queryKeys.assessments.detail(assessmentUuid) }),
        ]);
      }
    },
    onError: (error: Error & { status?: number; payload?: any }) => {
      if (error.status === 409) {
        const latest = error.payload?.detail?.latest as AssessmentSubmissionRead | undefined;
        if (latest) {
          openConflict(latest);
        }
        toast.error('Your draft changed in another tab. Resolve the conflict before submitting.');
        return;
      }
      setSaveState('error');
      void reportClientError({
        scope: 'assessment-flow',
        phase: 'submit-assessment',
        assessmentUuid,
        error: error.message || 'Failed to submit assessment',
      }).catch(() => undefined);
      toast.error(error.message || 'Failed to submit');
    },
  });

  useEffect(() => {
    const loadError = draftQuery.error ?? submissionsQuery.error;
    if (!loadError) return;
    const message = loadError.message;
    const key = `${assessmentUuid ?? 'missing'}:${message}`;
    if (reportedLoadError === key) return;
    setReportedLoadError(key);
    void reportClientError({
      scope: 'assessment-flow',
      phase: 'load-submission-state',
      assessmentUuid,
      error: message,
    }).catch(() => undefined);
  }, [assessmentUuid, draftQuery.error, reportedLoadError, submissionsQuery.error]);

  useEffect(() => {
    if (!assessmentUuid) {
      setLocalAnswers({});
      setSaveState('idle');
      setConflictState(null);
      return;
    }
    if (draftQuery.isLoading || submissionsQuery.isLoading) return;
    if (saveState === 'dirty' || saveState === 'conflict' || saveMutation.isPending || submitMutation.isPending) return;
    setLocalAnswers(answersFromSubmission(submission));
    if (saveState === 'idle' || saveState === 'saved') {
      setSaveState(submission ? 'saved' : 'idle');
    }
  }, [
    assessmentUuid,
    draftQuery.isLoading,
    submissionsQuery.isLoading,
    saveMutation.isPending,
    saveState,
    submission,
    submitMutation.isPending,
  ]);

  const setItemAnswer = useCallback((itemUuid: string, answer: ItemAnswer) => {
    setLocalAnswers((current) => ({ ...current, [itemUuid]: answer }));
    setSaveState('dirty');
  }, []);

  const keepLocalVersion = useCallback(() => {
    setConflictState(null);
    setSaveState('dirty');
  }, []);

  const useServerVersion = useCallback(() => {
    if (!conflictState) return;
    setLocalAnswers(answersFromSubmission(conflictState.latest));
    setConflictState(null);
    setSaveState(conflictState.latest.status === 'DRAFT' ? 'saved' : 'idle');
  }, [conflictState]);

  const { mutateAsync: saveMutateAsync, isPending: isSaving } = saveMutation;
  const { mutateAsync: submitMutateAsync, isPending: isSubmitting } = submitMutation;

  return useMemo(
    () => ({
      answers: localAnswers,
      setItemAnswer,
      save: () => saveMutateAsync(localAnswers),
      submit: (options?: SubmitOptions) =>
        submitMutateAsync({ answers: localAnswers, violationCount: options?.violationCount }),
      draft,
      submission,
      submissions: submissionsQuery.data ?? [],
      status: submission?.status ?? null,
      version,
      saveState,
      conflict:
        conflictState !== null
          ? {
              latestVersion: conflictState.latest.version,
              latestSavedAt: conflictState.latest.updated_at,
              localAnswerCount: Object.keys(conflictState.localAnswers).length,
              serverAnswerCount: Object.keys(answersFromSubmission(conflictState.latest)).length,
              onKeepLocalVersion: keepLocalVersion,
              onUseServerVersion: useServerVersion,
            }
          : null,
      isLoading: draftQuery.isLoading || submissionsQuery.isLoading,
      isSaving,
      isSubmitting,
      error: draftQuery.error ?? submissionsQuery.error,
    }),
    [
      draft,
      draftQuery.error,
      draftQuery.isLoading,
      conflictState,
      keepLocalVersion,
      localAnswers,
      saveMutateAsync,
      isSaving,
      saveState,
      setItemAnswer,
      submissionsQuery.data,
      submissionsQuery.error,
      submissionsQuery.isLoading,
      submission,
      useServerVersion,
      submitMutateAsync,
      isSubmitting,
      version,
    ],
  );
}

function cloneAnswers(answers: Record<string, ItemAnswer>): Record<string, ItemAnswer> {
  return typeof structuredClone === 'function'
    ? structuredClone(answers)
    : (JSON.parse(JSON.stringify(answers)) as Record<string, ItemAnswer>);
}
