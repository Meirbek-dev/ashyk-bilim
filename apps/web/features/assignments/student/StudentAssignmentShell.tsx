'use client';

import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock4, RotateCcw, SendHorizonal } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  getAssignmentDraftSubmission,
  saveAssignmentDraftSubmission,
  submitAssignmentDraftSubmission,
} from '@services/courses/assignments';
import type { AssignmentDraftRead, AssignmentTaskAnswer } from '@/features/assignments/domain';
import { isPublishedToStudent, type Submission } from '@/features/grading/domain';
import { useMySubmission } from '@/hooks/useMySubmission';
import PageLoading from '@components/Objects/Loaders/PageLoading';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';

import { areAnswerMapsEqual, answerMapToPatch, buildAnswerMapFromDraft, buildAnswerMapFromSubmission } from './attempt-utils';
import type { AssignmentAnswerMap, StudentAssignmentContextData } from './types';
import SubmissionFooter, { type DraftSaveState } from './SubmissionFooter';
import StudentResultPanel from './ResultPanel';
import TaskAttemptList from './TaskAttemptList';

interface StudentAssignmentShellProps {
  data: StudentAssignmentContextData;
}

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

export default function StudentAssignmentShell({ data }: StudentAssignmentShellProps) {
  const assignmentUuid = data.assignment.assignment_uuid;
  const activityId = data.activityId ?? null;
  const queryClient = useQueryClient();
  const draftQuery = useAssignmentDraft(assignmentUuid);
  const latestSubmission = useMySubmission(activityId);
  const [answers, setAnswers] = useState<AssignmentAnswerMap>({});
  const lastSavedRef = useRef<AssignmentAnswerMap>({});
  const [saveState, setSaveState] = useState<DraftSaveState>('saved');

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
      const res = await submitAssignmentDraftSubmission(assignmentUuid, answerMapToPatch(answers));
      if (!res.success) throw new Error(res.data?.detail || 'Failed to submit assignment');
      return res.data as Submission;
    },
    onSuccess: async () => {
      toast.success('Submitted for grading');
      lastSavedRef.current = answers;
      setSaveState('submitted');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: assignmentDraftQueryKey(assignmentUuid) }),
        latestSubmission.mutate(),
      ]);
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Failed to submit assignment'),
  });

  const handleTaskAnswerChange = (answer: AssignmentTaskAnswer) => {
    setAnswers((current) => ({ ...current, [answer.task_uuid]: answer }));
  };

  const canEdit = status === null || status === 'DRAFT' || status === 'RETURNED';
  const canSubmit = status === null || status === 'DRAFT' || status === 'RETURNED';
  const resultSubmission = submission ?? draftQuery.data?.submission ?? null;
  const showResult = Boolean(resultSubmission?.status && isPublishedToStudent(resultSubmission.status));

  const banner = getStatusBanner(status);

  if (draftQuery.isPending || latestSubmission.isLoading) return <PageLoading />;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-28">
      <section className="rounded-lg border bg-card p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-muted-foreground text-xs font-medium uppercase">Assignment</div>
            <h1 className="mt-1 text-2xl font-semibold">{data.assignment.title ?? 'Assignment'}</h1>
            {data.assignment.description ? (
              <p className="text-muted-foreground mt-2 text-sm leading-6">{data.assignment.description}</p>
            ) : null}
          </div>
          {data.assignment.due_at || data.assignment.due_date ? (
            <div className="rounded-md border px-3 py-2 text-sm">
              <div className="text-muted-foreground text-xs">Due</div>
              <div className="font-medium">{formatDate(data.assignment.due_at ?? data.assignment.due_date)}</div>
            </div>
          ) : null}
        </div>
      </section>

      {banner ? (
        <Alert variant={banner.variant}>
          <banner.icon className="size-4" />
          <AlertTitle>{banner.title}</AlertTitle>
          <AlertDescription>{banner.description}</AlertDescription>
        </Alert>
      ) : null}

      <TaskAttemptList
        tasks={data.tasks}
        answers={answers}
        disabled={!canEdit || saveMutation.isPending || submitMutation.isPending}
        courseUuid={data.courseUuid}
        activityUuid={data.activityUuid}
        assignmentUuid={assignmentUuid}
        onAnswerChange={handleTaskAnswerChange}
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

      <SubmissionFooter
        state={saveState}
        status={status}
        canSave={canEdit && !areAnswerMapsEqual(answers, lastSavedRef.current)}
        canSubmit={canSubmit}
        isSaving={saveMutation.isPending}
        isSubmitting={submitMutation.isPending}
        onSave={() => saveMutation.mutate(answers)}
        onSubmit={() => submitMutation.mutate()}
      />
    </div>
  );
}

function getStatusBanner(status: Submission['status'] | null) {
  if (status === 'PENDING') {
    return {
      icon: SendHorizonal,
      variant: 'default' as const,
      title: 'Submitted',
      description: 'Your work is waiting for review.',
    };
  }
  if (status === 'GRADED') {
    return {
      icon: Clock4,
      variant: 'default' as const,
      title: 'Graded',
      description: 'A grade has been saved and is waiting to be released.',
    };
  }
  if (status === 'PUBLISHED') {
    return {
      icon: CheckCircle2,
      variant: 'default' as const,
      title: 'Result available',
      description: 'Your grade and feedback are available below.',
    };
  }
  if (status === 'RETURNED') {
    return {
      icon: RotateCcw,
      variant: 'default' as const,
      title: 'Returned for revision',
      description: 'Review the feedback, revise your work, and submit again.',
    };
  }
  return null;
}

function formatDate(value?: string | null) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
