'use client';

import { Clock, FileText, InfinityIcon, RotateCcw, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import PageLoading from '@components/Objects/Loaders/PageLoading';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import AttemptEntryPanel from '@/features/assessments/shared/AttemptEntryPanel';
import AttemptHistoryList from '@/features/assessments/shared/AttemptHistoryList';
import { useAttemptShellControls } from '@/features/assessments/shell';
import { useAssessmentAttempt } from '@/features/assessments/shell/hooks/useAssessmentAttempt';
import { useAssessmentSubmission } from '@/features/assessments/hooks/useAssessmentSubmission';
import type { AssessmentItem, ItemAnswer } from '@/features/assessments/domain/items';
import type { AttemptSaveState } from '@/features/assessments/shell';
import { CanonicalAttemptItem } from '@/features/assessments/shared/canonical-item-rendering';
import { apiFetch } from '@/lib/api-client';
import { queryKeys } from '@/lib/react-query/queryKeys';
import type { KindAttemptProps } from './index';

export default function AssignmentAttemptContent({ vm }: KindAttemptProps) {
  const t = useTranslations('Activities.AssignmentStudentActivity');
  const queryClient = useQueryClient();
  const assessmentUuid = vm?.assessmentUuid ?? null;
  const submissionsQueryKey = useMemo(
    () => ['assessments', 'submissions', 'me', assessmentUuid ?? 'missing'] as const,
    [assessmentUuid],
  );
  const submissionState = useAssessmentSubmission(assessmentUuid, vm?.activityUuid ?? null);
  const [isStarting, setIsStarting] = useState(false);
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [recoveredAnswers, setRecoveredAnswers] = useState<Record<string, ItemAnswer> | null>(null);
  const { draft, status } = submissionState;
  const saveState = mapSaveState(submissionState.saveState, status);
  const canEdit = vm?.canEdit ?? false;
  const canSave = Boolean(vm?.canSaveDraft) && submissionState.saveState === 'dirty';
  const canSubmit = Boolean(vm?.canSubmit);
  const latestCompletedSubmission =
    submissionState.submissions.find((submission) => submission.status !== 'DRAFT') ?? null;

  const persistence = useAssessmentAttempt<Record<string, ItemAnswer>>({
    attemptUuid: draft?.submission_uuid ?? `entry_${assessmentUuid ?? 'missing'}`,
    autoSaveInterval: 5000,
    expirationHours: 24,
    onRestore: (answers) => {
      if (draft && Object.keys(submissionState.answers).length === 0 && Object.keys(answers).length > 0) {
        setRecoveredAnswers(answers);
        setShowRecoveryDialog(true);
      }
    },
  });

  useEffect(() => {
    if (status !== 'DRAFT' || submissionState.saveState !== 'dirty') return;
    const timeout = setTimeout(() => {
      void submissionState.save();
    }, 1000);
    return () => clearTimeout(timeout);
  }, [status, submissionState]);

  const handleStart = useCallback(async () => {
    if (!assessmentUuid || !vm?.canEdit) return;
    setIsStarting(true);
    try {
      const response = await apiFetch(`assessments/${assessmentUuid}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || t('failedToStartAssessment'));
      }
      toast.success(vm.isReturnedForRevision ? t('revisionDraftCreated') : t('assessmentStarted'));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.assessments.draft(assessmentUuid) }),
        queryClient.invalidateQueries({ queryKey: submissionsQueryKey }),
        queryClient.invalidateQueries({ queryKey: queryKeys.assessments.detail(assessmentUuid) }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('failedToStartAssessment'));
    } finally {
      setIsStarting(false);
    }
  }, [assessmentUuid, queryClient, submissionsQueryKey, t, vm?.canEdit, vm?.isReturnedForRevision]);

  const handleItemAnswerChange = useCallback(
    (itemUuid: string, answer: ItemAnswer) => {
      submissionState.setItemAnswer(itemUuid, answer);
      persistence.saveAnswers({
        ...submissionState.answers,
        [itemUuid]: answer,
      });
    },
    [persistence, submissionState],
  );

  const shellControls = useMemo(
    () => ({
      saveState,
      status,
      canSave,
      canSubmit,
      isSaving: submissionState.isSaving,
      isSubmitting: submissionState.isSubmitting,
      onSave: canSave ? () => void submissionState.save() : undefined,
      onSubmit: canSubmit
        ? async () => {
            await submissionState.submit();
            persistence.clearSavedAnswers();
          }
        : undefined,
      navigation: null,
      recovery: showRecoveryDialog
        ? {
            open: true,
            lastSavedAt: persistence.getRecoverableData()?.lastSaved ?? null,
            onAccept: () => {
              if (recoveredAnswers) {
                for (const [itemUuid, answer] of Object.entries(recoveredAnswers)) {
                  submissionState.setItemAnswer(itemUuid, answer);
                }
              }
              setShowRecoveryDialog(false);
              setRecoveredAnswers(null);
              toast.success(t('recoveredSavedAnswers'));
            },
            onReject: () => {
              persistence.clearSavedAnswers();
              setShowRecoveryDialog(false);
              setRecoveredAnswers(null);
            },
          }
        : null,
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
    [canSave, canSubmit, persistence, recoveredAnswers, saveState, showRecoveryDialog, status, submissionState, t],
  );
  useAttemptShellControls(shellControls);

  if (!vm || submissionState.isLoading) {
    return <PageLoading />;
  }

  if (!assessmentUuid) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        {t('noAssessmentFound')}
      </div>
    );
  }

  const attemptHistory = submissionState.submissions.map((submission, index) => ({
    id: submission.submission_uuid,
    label:
      index === 0 ? t('latestSubmission') : t('attemptNumber', { number: submissionState.submissions.length - index }),
    submittedAt: submission.submitted_at ?? submission.updated_at,
    status: submission.status,
    scoreLabel:
      submission.final_score !== null && submission.final_score !== undefined
        ? `${Math.round(submission.final_score)}%`
        : null,
  }));

  if (!draft) {
    return (
      <AttemptEntryPanel
        title={vm.title}
        description={vm.description}
        metrics={[
          { icon: FileText, label: t('itemsLabel'), value: String(vm.items.length) },
          {
            icon: Clock,
            label: t('timeLimit'),
            value:
              typeof vm.policy.timeLimitSeconds === 'number'
                ? `${Math.max(1, Math.ceil(vm.policy.timeLimitSeconds / 60))} ${t('minutesShort')}`
                : t('unlimited'),
          },
          {
            icon: vm.policy.maxAttempts ? Users : InfinityIcon,
            label: t('attemptsLabel'),
            value:
              typeof vm.policy.maxAttempts === 'number'
                ? t('attemptsRemaining', { remaining: Math.max(vm.policy.maxAttempts - attemptHistory.length, 0) })
                : t('unlimited'),
          },
        ]}
        historyItems={attemptHistory}
        actionTitle={vm.isReturnedForRevision ? t('readyToRevise') : t('readyToBegin')}
        actionDescription={vm.isReturnedForRevision ? t('readyToReviseDescription') : t('readyToBeginDescription')}
        actionLabel={vm.canEdit ? (vm.isReturnedForRevision ? t('startRevision') : t('startAssessment')) : undefined}
        actionDisabled={!vm.canEdit}
        actionPending={isStarting}
        blockedMessage={!vm.canEdit ? t('noEditableDraft') : null}
        onAction={vm.canEdit ? handleStart : undefined}
        notices={
          latestCompletedSubmission ? (
            <SubmissionStatePanel
              submission={latestCompletedSubmission}
              releaseState={vm.releaseState}
            />
          ) : null
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <Alert>
        <RotateCcw className="size-4" />
        <AlertTitle>{t('resumedDraft')}</AlertTitle>
        <AlertDescription>{t('resumedDraftDescription', { time: formatDateTime(draft.updated_at) })}</AlertDescription>
      </Alert>

      {attemptHistory.length ? <AttemptHistoryList items={attemptHistory} /> : null}

      <SubmissionStatePanel
        submission={latestCompletedSubmission}
        releaseState={vm.releaseState}
      />

      <div className="space-y-4">
        {vm.items.map((item, index) => (
          <AssessmentItemCard
            key={item.item_uuid}
            index={index}
            item={item}
            answer={submissionState.answers[item.item_uuid]}
            disabled={!canEdit || submissionState.isSaving || submissionState.isSubmitting}
            assessmentUuid={assessmentUuid}
            onChange={(answer) => handleItemAnswerChange(item.item_uuid, answer)}
          />
        ))}
      </div>
    </div>
  );
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

function SubmissionStatePanel({
  submission,
  releaseState,
}: {
  submission: {
    status: 'DRAFT' | 'PENDING' | 'GRADED' | 'PUBLISHED' | 'RETURNED';
    final_score?: number | null;
    grading_json?: { feedback?: string } | null;
    submitted_at?: string | null;
  } | null;
  releaseState: 'HIDDEN' | 'AWAITING_RELEASE' | 'VISIBLE' | 'RETURNED_FOR_REVISION';
}) {
  const t = useTranslations('Activities.AssignmentStudentActivity');

  if (!submission || submission.status === 'DRAFT') return null;

  if (submission.status === 'PENDING') {
    const submittedDescription = submission.submitted_at
      ? t('submissionReceivedWithDateDescription', { date: formatDateTime(submission.submitted_at) })
      : t('submissionReceivedDescription');

    return (
      <Alert>
        <AlertTitle>{t('submissionReceivedTitle')}</AlertTitle>
        <AlertDescription>{submittedDescription}</AlertDescription>
      </Alert>
    );
  }

  if (submission.status === 'GRADED' || releaseState === 'AWAITING_RELEASE') {
    return (
      <Alert>
        <AlertTitle>{t('resultsWaitingForReleaseTitle')}</AlertTitle>
        <AlertDescription>{t('resultsWaitingForReleaseDescription')}</AlertDescription>
      </Alert>
    );
  }

  const scoreVisible = submission.status === 'PUBLISHED' || submission.status === 'RETURNED';
  const scoreLabel =
    scoreVisible && submission.final_score !== null && submission.final_score !== undefined
      ? `${Math.round(submission.final_score)}%`
      : null;

  return (
    <Alert>
      <AlertTitle>{submission.status === 'RETURNED' ? t('returnedForRevision') : t('resultAvailable')}</AlertTitle>
      <AlertDescription className="space-y-3">
        {scoreLabel ? (
          <span className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium">
            <Badge variant="secondary">{t('scoreLabel')}</Badge>
            {scoreLabel}
          </span>
        ) : null}
        {submission.grading_json?.feedback ? (
          <p className="whitespace-pre-wrap">{submission.grading_json.feedback}</p>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

function AssessmentItemCard({
  index,
  item,
  answer,
  disabled,
  assessmentUuid,
  onChange,
}: {
  index: number;
  item: AssessmentItem;
  answer: ItemAnswer | undefined;
  disabled: boolean;
  assessmentUuid: string;
  onChange: (answer: ItemAnswer) => void;
}) {
  const t = useTranslations('Activities.AssignmentStudentActivity');

  return (
    <section
      id={`item-${item.item_uuid}`}
      className="bg-card space-y-4 rounded-lg border p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-muted-foreground text-xs font-medium uppercase">
            {t('questionLabel', { index: index + 1 })}
          </div>
          <h2 className="mt-1 text-base font-semibold">{item.title || t('questionLabel', { index: index + 1 })}</h2>
        </div>
        <Badge variant="outline">
          {item.max_score} {t('pointsShort')}
        </Badge>
      </div>

      <ItemAttemptRenderer
        item={item}
        answer={answer}
        disabled={disabled}
        assessmentUuid={assessmentUuid}
        onChange={onChange}
      />
    </section>
  );
}

function ItemAttemptRenderer({
  item,
  answer,
  disabled,
  assessmentUuid,
  onChange,
}: {
  item: AssessmentItem;
  answer: ItemAnswer | undefined;
  disabled: boolean;
  assessmentUuid: string;
  onChange: (answer: ItemAnswer) => void;
}) {
  return (
    <CanonicalAttemptItem
      item={item}
      answer={answer}
      disabled={disabled}
      assessmentUuid={assessmentUuid}
      onChange={onChange}
    />
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}
