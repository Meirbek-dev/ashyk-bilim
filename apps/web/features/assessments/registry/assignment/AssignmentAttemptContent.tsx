'use client';

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  getAssignmentDraftSubmission,
  saveAssignmentDraftSubmission,
  submitAssignmentDraftSubmission,
} from '@services/courses/assignments';
import type { AssignmentDraftRead, AssignmentTaskAnswer } from '@/features/assignments/domain';
import { normalizeAssignmentTasks } from '@/features/assignments/domain';
import { useAssignmentBundle, useAssignmentByActivity } from '@/features/assignments/hooks/useAssignments';
import { isPublishedToStudent, type Submission } from '@/features/grading/domain';
import { useMySubmission } from '@/hooks/useMySubmission';
import PageLoading from '@components/Objects/Loaders/PageLoading';
import { Separator } from '@/components/ui/separator';
import AttemptHistoryList from '@/features/assessments/shared/AttemptHistoryList';
import { useAttemptShellControls, type AttemptSaveState } from '@/features/assessments/shell';
import StudentResultPanel from '@/features/assignments/student/ResultPanel';
import TaskAttemptList from '@/features/assignments/student/TaskAttemptList';
import {
  areAnswerMapsEqual,
  answerMapToPatch,
  buildAnswerMapFromDraft,
  buildAnswerMapFromSubmission,
} from '@/features/assignments/student/attempt-utils';
import type { AssignmentAnswerMap } from '@/features/assignments/student/types';
import type { KindAttemptProps } from '../index';

const assignmentDraftQueryKey = (assignmentUuid: string | undefined) =>
  ['assignments', 'student-attempt-draft', assignmentUuid ?? 'missing'] as const;

function useAssignmentDraft(assignmentUuid: string | undefined) {
  return useQuery(
    queryOptions({
      queryKey: assignmentDraftQueryKey(assignmentUuid),
      queryFn: async () => {
        if (!assignmentUuid) return null;
        const res = await getAssignmentDraftSubmission(assignmentUuid);
        if (!res.success) throw new Error(res.data?.detail || 'Failed to load assignment draft');
        return res.data as AssignmentDraftRead;
      },
      enabled: Boolean(assignmentUuid),
    }),
  );
}

export default function AssignmentAttemptContent({ activityUuid, courseUuid }: KindAttemptProps) {
  const assignmentByActivity = useAssignmentByActivity(activityUuid);
  const assignmentUuid = assignmentByActivity.data?.assignment_uuid;
  const { data: bundle, isPending: isBundlePending } = useAssignmentBundle(assignmentUuid ?? null);
  const queryClient = useQueryClient();
  const draftQuery = useAssignmentDraft(assignmentUuid);
  const activityId = bundle?.activity_object?.id ?? null;
  const latestSubmission = useMySubmission(activityId);
  const [answers, setAnswers] = useState<AssignmentAnswerMap>({});
  const lastSavedRef = useRef<AssignmentAnswerMap>({});
  const [saveState, setSaveState] = useState<AttemptSaveState>('saved');

  const submission = latestSubmission.submission;
  const status = submission?.status ?? draftQuery.data?.submission?.status ?? null;
  const answerSource = draftQuery.data?.submission ?? (status === 'RETURNED' ? submission : null);

  useEffect(() => {
    if (draftQuery.isPending || latestSubmission.isLoading) return;
    const nextAnswers = draftQuery.data?.submission
      ? buildAnswerMapFromDraft(draftQuery.data)
      : buildAnswerMapFromSubmission(answerSource);
    setAnswers(nextAnswers);
    lastSavedRef.current = nextAnswers;
    setSaveState('saved');
  }, [answerSource, draftQuery.data, draftQuery.isPending, latestSubmission.isLoading]);

  useEffect(() => {
    if (areAnswerMapsEqual(answers, lastSavedRef.current)) {
      setSaveState((current) => (current === 'saving' ? current : 'saved'));
    } else {
      setSaveState('unsaved');
    }
  }, [answers]);

  const saveMutation = useMutation({
    mutationFn: async (nextAnswers: AssignmentAnswerMap) => {
      if (!assignmentUuid) throw new Error('Assignment is not ready');
      const res = await saveAssignmentDraftSubmission(assignmentUuid, answerMapToPatch(nextAnswers));
      if (!res.success) throw new Error(res.data?.detail || 'Failed to save draft');
      return res.data as Submission;
    },
    onMutate: () => setSaveState('saving'),
    onSuccess: async (_saved, savedAnswers) => {
      lastSavedRef.current = savedAnswers;
      setSaveState('saved');
      await queryClient.invalidateQueries({ queryKey: assignmentDraftQueryKey(assignmentUuid) });
    },
    onError: (error) => {
      setSaveState('error');
      toast.error(error instanceof Error ? error.message : 'Failed to save draft');
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!assignmentUuid) throw new Error('Assignment is not ready');
      const res = await submitAssignmentDraftSubmission(assignmentUuid, answerMapToPatch(answers));
      if (!res.success) throw new Error(res.data?.detail || 'Failed to submit assignment');
      return res.data as Submission;
    },
    onSuccess: async () => {
      toast.success('Awaiting grade');
      lastSavedRef.current = answers;
      setSaveState('submitted');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: assignmentDraftQueryKey(assignmentUuid) }),
        latestSubmission.mutate(),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to submit assignment'),
  });

  const canEdit = status === null || status === 'DRAFT' || status === 'RETURNED';
  const canSubmit = status === null || status === 'DRAFT' || status === 'RETURNED';
  const canSave = canEdit && !areAnswerMapsEqual(answers, lastSavedRef.current);
  const saveDraft = saveMutation.mutate;
  const submitDraft = submitMutation.mutate;
  const handleSave = useCallback(() => saveDraft(answers), [answers, saveDraft]);
  const handleSubmit = useCallback(() => submitDraft(), [submitDraft]);

  const shellControls = useMemo(
    () => ({
      saveState,
      status,
      canSave,
      canSubmit,
      isSaving: saveMutation.isPending,
      isSubmitting: submitMutation.isPending,
      onSave: handleSave,
      onSubmit: handleSubmit,
    }),
    [canSave, canSubmit, handleSave, handleSubmit, saveMutation.isPending, saveState, status, submitMutation.isPending],
  );
  useAttemptShellControls(shellControls);

  if (assignmentByActivity.isPending || isBundlePending || draftQuery.isPending || latestSubmission.isLoading) {
    return <PageLoading />;
  }

  if (!assignmentUuid || !bundle?.assignment_object) {
    return <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">No assignment found.</div>;
  }

  const tasks = normalizeAssignmentTasks(bundle.assignment_tasks);
  const resultSubmission = submission ?? draftQuery.data?.submission ?? null;
  const showResult = Boolean(resultSubmission?.status && isPublishedToStudent(resultSubmission.status));
  const attemptHistory = resultSubmission
    ? [
        {
          id: resultSubmission.submission_uuid,
          label: 'Latest submission',
          submittedAt: resultSubmission.submitted_at ?? resultSubmission.updated_at,
          status: resultSubmission.status,
          scoreLabel:
            resultSubmission.final_score !== null && resultSubmission.final_score !== undefined
              ? `${Math.round(resultSubmission.final_score)}%`
              : null,
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      {attemptHistory.length ? <AttemptHistoryList items={attemptHistory} /> : null}

      <TaskAttemptList
        tasks={tasks}
        answers={answers}
        disabled={!canEdit || saveMutation.isPending || submitMutation.isPending}
        courseUuid={bundle.course_object?.course_uuid ?? courseUuid}
        activityUuid={bundle.activity_object?.activity_uuid ?? activityUuid}
        assignmentUuid={assignmentUuid}
        onAnswerChange={(answer: AssignmentTaskAnswer) =>
          setAnswers((current) => ({ ...current, [answer.task_uuid]: answer }))
        }
      />

      {showResult && resultSubmission ? (
        <>
          <Separator />
          <StudentResultPanel
            submission={resultSubmission}
            onRefresh={() => void latestSubmission.mutate()}
          />
        </>
      ) : null}
    </div>
  );
}
