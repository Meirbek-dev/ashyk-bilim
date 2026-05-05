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
  const [reportedLoadError, setReportedLoadError] = useState<string | null>(null);
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
      setSaveState('saved');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: draftQueryOptions.queryKey }),
        queryClient.invalidateQueries({ queryKey: submissionsQueryKey }),
      ]);
    },
    onError: (error: Error & { status?: number; payload?: any }) => {
      if (error.status === 409) {
         const latest = error.payload?.detail?.latest as AssessmentSubmissionRead | undefined;
        if (latest) setLocalAnswers(answersFromSubmission(latest));
        setSaveState('conflict');
        toast.error('Your draft changed in another tab. Review the latest saved version.');
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
      setSaveState('saved');
      if (assessmentUuid) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: draftQueryOptions.queryKey }),
          queryClient.invalidateQueries({ queryKey: submissionsQueryKey }),
          queryClient.invalidateQueries({ queryKey: queryKeys.assessments.detail(assessmentUuid) }),
        ]);
      }
    },
    onError: (error: Error) => {
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
      return;
    }
    if (draftQuery.isLoading || submissionsQuery.isLoading) return;
    if (saveState === 'dirty' || saveMutation.isPending || submitMutation.isPending) return;
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
      isLoading: draftQuery.isLoading || submissionsQuery.isLoading,
      isSaving,
      isSubmitting,
      error: draftQuery.error ?? submissionsQuery.error,
    }),
    [
      draft,
      draftQuery.error,
      draftQuery.isLoading,
      localAnswers,
      saveMutateAsync,
      isSaving,
      saveState,
      setItemAnswer,
      submissionsQuery.data,
      submissionsQuery.error,
      submissionsQuery.isLoading,
      submission,
      submitMutateAsync,
      isSubmitting,
      version,
    ],
  );
}
