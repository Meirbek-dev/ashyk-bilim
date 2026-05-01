'use client';

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/api-client';
import { queryKeys } from '@/lib/react-query/queryKeys';
import type { ItemAnswer } from '../domain/items';

interface SubmissionRead {
  submission_uuid: string;
  answers_json: { answers?: Record<string, ItemAnswer> } | Record<string, unknown>;
  status: 'DRAFT' | 'PENDING' | 'GRADED' | 'PUBLISHED' | 'RETURNED';
  version: number;
  updated_at: string;
}

interface DraftRead {
  assessment_uuid: string;
  submission: SubmissionRead | null;
}

export type AssessmentSaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'conflict' | 'error';

function answersFromSubmission(submission: SubmissionRead | null | undefined): Record<string, ItemAnswer> {
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

  const draftQueryOptions = useMemo(
    () =>
      queryOptions({
        queryKey: [...queryKeys.assessments.draft(assessmentUuid), setLocalAnswers, setSaveState],
        queryFn: async () => {
          const response = await apiFetch(`assessments/${assessmentUuid}/draft`);
          const payload = (await readJsonOrThrow(response)) as DraftRead;
          setLocalAnswers(answersFromSubmission(payload.submission));
          setSaveState('idle');
          return payload;
        },
      }),
    [assessmentUuid, setLocalAnswers, setSaveState],
  );

  const draftQuery = useQuery({
    ...draftQueryOptions,
    enabled: Boolean(assessmentUuid),
  });

  const version = draftQuery.data?.submission?.version;

  const saveMutation = useMutation({
    mutationFn: async (answers: Record<string, ItemAnswer>) => {
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
      return (await readJsonOrThrow(response)) as SubmissionRead;
    },
    onMutate: () => setSaveState('saving'),
    onSuccess: async () => {
      setSaveState('saved');
      if (assessmentUuid) {
        await queryClient.invalidateQueries({ queryKey: draftQueryOptions.queryKey });
      }
    },
    onError: (error: Error & { status?: number; payload?: any }) => {
      if (error.status === 409) {
        const latest = error.payload?.detail?.latest as SubmissionRead | undefined;
        if (latest) setLocalAnswers(answersFromSubmission(latest));
        setSaveState('conflict');
        toast.error('Your draft changed in another tab. Review the latest saved version.');
        return;
      }
      setSaveState('error');
      toast.error(error.message || 'Failed to save draft');
    },
  });

  const submitMutation = useMutation({
    mutationFn: async (answers: Record<string, ItemAnswer>) => {
      const response = await apiFetch(`assessments/${assessmentUuid}/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(version ? { 'If-Match': String(version) } : {}),
        },
        body: JSON.stringify({
          answers: Object.entries(answers).map(([item_uuid, answer]) => ({ item_uuid, answer })),
        }),
      });
      return (await readJsonOrThrow(response)) as SubmissionRead;
    },
    onSuccess: async () => {
      setSaveState('saved');
      if (assessmentUuid) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: draftQueryOptions.queryKey }),
          queryClient.invalidateQueries({ queryKey: queryKeys.assessments.detail(assessmentUuid) }),
        ]);
      }
    },
    onError: (error: Error) => {
      setSaveState('error');
      toast.error(error.message || 'Failed to submit');
    },
  });

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
      submit: () => submitMutateAsync(localAnswers),
      submission: draftQuery.data?.submission ?? null,
      status: draftQuery.data?.submission?.status ?? null,
      version,
      saveState,
      isLoading: draftQuery.isLoading,
      isSaving,
      isSubmitting,
      error: draftQuery.error,
    }),
    [
      draftQuery.data?.submission,
      draftQuery.error,
      draftQuery.isLoading,
      localAnswers,
      saveMutateAsync,
      isSaving,
      saveState,
      setItemAnswer,
      submitMutateAsync,
      isSubmitting,
      version,
    ],
  );
}
