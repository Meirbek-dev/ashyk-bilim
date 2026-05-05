'use client';

import { AlertCircle, CheckCircle, Clock, FileText, InfinityIcon, ShieldAlert, Users } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { courseKeys } from '@/hooks/courses/courseKeys';
import { useContributorStatus } from '@/hooks/useContributorStatus';
import { DEFAULT_POLICY_VIEW } from '@/features/assessments/domain/policy';
import { isAnswered as isItemAnswered } from '@/features/assessments/domain/items';
import type { AssessmentItem, ItemAnswer } from '@/features/assessments/domain/items';
import AttemptEntryPanel from '@/features/assessments/shared/AttemptEntryPanel';
import AttemptHistoryList from '@/features/assessments/shared/AttemptHistoryList';
import { useAttemptShellControls } from '@/features/assessments/shell';
import { useAssessmentAttempt } from '@/features/assessments/shell/hooks/useAssessmentAttempt';
import { useAssessmentSubmission } from '@/features/assessments/hooks/useAssessmentSubmission';
import PageLoading from '@components/Objects/Loaders/PageLoading';
import ExamQuestionNavigation, { ExamQuestionNavigationMobile } from './ExamQuestionNavigation';
import { getOrderedExamQuestions } from './questionOrder';
import { Progress } from '@components/ui/progress';
import type { KindAttemptProps } from '../index';
import ExamQuestionCard from './ExamQuestionCard';
import ExamSubmitDialog from './ExamSubmitDialog';

interface QuestionData {
  id: string;
  question_uuid: string;
  question_text: string;
  question_type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'MATCHING';
  points: number;
  explanation?: string;
  answer_options: { text: string; is_correct?: boolean; left?: string; right?: string; option_id?: string | number }[];
}

export default function ExamAttemptContent({ courseUuid, vm }: KindAttemptProps) {
  const t = useTranslations('Activities.ExamActivity');
  const queryClient = useQueryClient();
  const { contributorStatus } = useContributorStatus(courseUuid);
  const submissionState = useAssessmentSubmission(vm?.assessmentUuid ?? null);
  const [isStarting, setIsStarting] = useState(false);
  const policy = vm?.policy ?? DEFAULT_POLICY_VIEW;
  const assessmentUuid = vm?.assessmentUuid ?? null;
  const questions = useMemo(() => buildExamQuestions(vm?.items ?? []), [vm?.items]);

  const handleComplete = useCallback(async () => {
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: queryKeys.trail.current() }),
      queryClient.invalidateQueries({ queryKey: courseKeys.structure(courseUuid, false) }),
    ]);

    if (!assessmentUuid) return;

    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: queryKeys.assessments.draft(assessmentUuid) }),
      queryClient.invalidateQueries({ queryKey: ['assessments', 'submissions', 'me', assessmentUuid] }),
      queryClient.invalidateQueries({ queryKey: queryKeys.assessments.detail(assessmentUuid) }),
    ]);
  }, [assessmentUuid, courseUuid, queryClient]);

  if (!vm || submissionState.isLoading) {
    return <PageLoading />;
  }

  if (!assessmentUuid) {
    return <div className="text-destructive rounded-lg border p-6 text-sm">{t('errorLoadingExam')}</div>;
  }

  const latestCompletedSubmission = submissionState.submissions.find((submission) => submission.status !== 'DRAFT') ?? null;
  const historyItems = submissionState.submissions
    .filter((submission) => submission.status !== 'DRAFT')
    .map((submission, index) => ({
      id: submission.submission_uuid,
      label: index === 0 ? 'Latest submission' : `Attempt ${submissionState.submissions.length - index}`,
      submittedAt: submission.submitted_at ?? submission.updated_at,
      status: submission.status,
      scoreLabel:
        typeof submission.final_score === 'number' ? `${Math.round(submission.final_score)}%` : null,
    }));

  const handleStartExam = async () => {
    if (!assessmentUuid || !vm.canEdit) return;
    setIsStarting(true);
    try {
      const response = await apiFetch(`assessments/${assessmentUuid}/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.detail || 'Failed to start exam');
      }
      toast.success(vm.isReturnedForRevision ? 'Revision draft created' : t('examStarted'));
      await handleComplete();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('errorStartingExam'));
    } finally {
      setIsStarting(false);
    }
  };

  if (!submissionState.draft) {
    return (
      <AttemptEntryPanel
        title={vm.title}
        description={vm.description}
        metrics={[
          { icon: FileText, label: t('totalQuestions'), value: String(questions.length) },
          {
            icon: Clock,
            label: t('timeLimit'),
            value:
              typeof policy.timeLimitSeconds === 'number'
                ? t('minutes', { count: Math.max(1, Math.ceil(policy.timeLimitSeconds / 60)) })
                : t('unlimited'),
          },
          {
            icon: contributorStatus === 'ACTIVE' ? InfinityIcon : Users,
            label: contributorStatus === 'ACTIVE' ? t('teacherPreview') : t('attemptsRemaining'),
            value:
              contributorStatus === 'ACTIVE' || policy.maxAttempts === null
                ? t('unlimited')
                : String(Math.max(policy.maxAttempts - historyItems.length, 0)),
          },
        ]}
        historyItems={historyItems}
        actionTitle={vm.isReturnedForRevision ? 'Ready to revise' : t('readyToStart')}
        actionDescription={
          vm.isReturnedForRevision
            ? 'Start a new revision draft from the returned submission.'
            : t('readyToStartSubtitle')
        }
        actionLabel={vm.canEdit ? (vm.isReturnedForRevision ? 'Start revision' : t('startExam')) : undefined}
        actionDisabled={!vm.canEdit}
        actionPending={isStarting}
        blockedMessage={!vm.canEdit ? 'There is no editable draft available for this exam right now.' : null}
        onAction={vm.canEdit ? handleStartExam : undefined}
        notices={
          <div className="space-y-4">
            <div className="bg-muted/30 rounded-md border p-4">
              <h3 className="mb-3 text-sm font-semibold">{t('instructions')}</h3>
              <ul className="space-y-2 text-sm">
                <Instruction
                  icon={CheckCircle}
                  label={t('instruction1')}
                />
                {policy.timeLimitSeconds ? (
                  <Instruction
                    icon={CheckCircle}
                    label={t('instruction3', { minutes: Math.max(1, Math.ceil(policy.timeLimitSeconds / 60)) })}
                  />
                ) : null}
                <Instruction
                  icon={AlertCircle}
                  label={t('instruction2')}
                />
                {policy.antiCheat.tabSwitchDetection ? (
                  <Instruction
                    icon={AlertCircle}
                    label={t('instruction4')}
                  />
                ) : null}
                {policy.antiCheat.copyPasteProtection ? (
                  <Instruction
                    icon={AlertCircle}
                    label={t('instruction5')}
                  />
                ) : null}
              </ul>
            </div>
            {isAntiCheatWarningVisible(policy) ? (
              <Alert className="border-red-200 bg-red-50/80 text-red-900">
                <ShieldAlert className="size-4" />
                <AlertTitle>{t('antiCheatingEnabled')}</AlertTitle>
                <AlertDescription>
                  {t('antiCheatingDescription', { threshold: policy.antiCheat.violationThreshold || t('notSet') })}
                </AlertDescription>
              </Alert>
            ) : null}
            {latestCompletedSubmission ? (
              <ExamSubmissionStatePanel submission={latestCompletedSubmission} />
            ) : null}
          </div>
        }
      />
    );
  }

  return (
    <ExamTakingContent
      title={vm.title}
      questions={questions}
      submissionState={submissionState}
      attempt={submissionState.draft}
      policy={policy}
      onComplete={handleComplete}
      canSaveDraft={vm.canSaveDraft}
      canSubmit={vm.canSubmit}
      latestCompletedSubmission={latestCompletedSubmission}
      historyItems={historyItems}
    />
  );
}

function ExamTakingContent({
  title,
  questions,
  submissionState,
  attempt,
  policy,
  onComplete,
  canSaveDraft,
  canSubmit,
  latestCompletedSubmission,
  historyItems,
}: {
  title: string;
  questions: QuestionData[];
  submissionState: ReturnType<typeof useAssessmentSubmission>;
  attempt: NonNullable<ReturnType<typeof useAssessmentSubmission>['draft']>;
  policy: typeof DEFAULT_POLICY_VIEW;
  onComplete: () => void | Promise<void>;
  canSaveDraft: boolean;
  canSubmit: boolean;
  latestCompletedSubmission: ReturnType<typeof useAssessmentSubmission>['submission'];
  historyItems: Array<{
    id: string;
    label: string;
    submittedAt: string | null | undefined;
    status: 'PENDING' | 'GRADED' | 'PUBLISHED' | 'RETURNED';
    scoreLabel: string | null;
  }>;
}) {
  const t = useTranslations('Activities.ExamActivity');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isConfirmingSubmit, setIsConfirmingSubmit] = useState(false);
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [recoveredAnswers, setRecoveredAnswers] = useState<Record<string, ItemAnswer> | null>(null);
  const violationCountRef = useRef(0);

  const persistence = useAssessmentAttempt<Record<string, ItemAnswer>>({
    attemptUuid: attempt.submission_uuid,
    autoSaveInterval: 5000,
    expirationHours: 24,
    storageKeyPrefix: 'exam_answers_',
    onRestore: (recovered) => {
      if (Object.keys(submissionState.answers).length === 0 && Object.keys(recovered).length > 0) {
        setRecoveredAnswers(recovered);
        setShowRecoveryDialog(true);
      }
    },
  });

  const orderedQuestions = useMemo(() => getOrderedExamQuestions(questions, null), [questions]);
  const currentQuestion = orderedQuestions[currentIndex];
  const questionById = useMemo(
    () => new Map(orderedQuestions.map((question) => [question.id, question])),
    [orderedQuestions],
  );

  const displayAnswers = useMemo(() => {
    const next: Record<string, unknown> = {};
    for (const question of orderedQuestions) {
      const answer = submissionState.answers[question.id];
      if (!answer) continue;
      next[question.id] = toExamAnswer(question, answer);
    }
    return next;
  }, [orderedQuestions, submissionState.answers]);

  const isAnswered = useCallback(
    (questionId: string) => isItemAnswered(submissionState.answers[questionId]),
    [submissionState.answers],
  );

  const answeredCount = orderedQuestions.filter((question) => isAnswered(question.id)).length;
  const answeredIndexes = useMemo(
    () =>
      orderedQuestions.reduce<Set<number>>((set, question, index) => {
        if (isAnswered(question.id)) set.add(index);
        return set;
      }, new Set()),
    [isAnswered, orderedQuestions],
  );

  const progress = orderedQuestions.length > 0 ? ((currentIndex + 1) / orderedQuestions.length) * 100 : 0;

  const handleAnswerChange = (questionId: string, answer: unknown) => {
    const question = questionById.get(questionId);
    if (!question) return;
    const canonicalAnswer = fromExamAnswer(question, answer);
    submissionState.setItemAnswer(question.id, canonicalAnswer);
    persistence.saveAnswers({
      ...submissionState.answers,
      [question.id]: canonicalAnswer,
    });
  };

  const handleOpenSubmitConfirmation = useCallback(() => {
    setIsConfirmingSubmit(true);
  }, []);

  const handleSubmit = useCallback(
    async (isAutoSubmit = false) => {
      void isAutoSubmit;
      if (submissionState.isSubmitting) return;
      setIsConfirmingSubmit(false);

      try {
        await submissionState.submit({ violationCount: violationCountRef.current });
        persistence.clearSavedAnswers();
        toast.success(t('examSubmittedSuccessfully'));
        await onComplete();
      } catch (error) {
        console.error('Error submitting exam:', error);
        toast.error(t('errorSubmittingExam'));
      }
    },
    [onComplete, persistence, submissionState, t],
  );

  const handleViolation = useCallback((type: string, count: number) => {
    void type;
    violationCountRef.current = count;
  }, []);

  useEffect(() => {
    if (submissionState.status !== 'DRAFT' || submissionState.saveState !== 'dirty') return;
    const timeout = setTimeout(() => {
      void submissionState.save();
    }, 1000);
    return () => clearTimeout(timeout);
  }, [submissionState]);

  const shellControls = useMemo(
    () => ({
      saveState: submissionState.isSubmitting
        ? ('saving' as const)
        : submissionState.status === 'PENDING'
          ? ('submitted' as const)
          : submissionState.status === 'RETURNED'
            ? ('returned' as const)
          : submissionState.saveState === 'dirty'
            ? ('unsaved' as const)
            : submissionState.saveState === 'saving'
              ? ('saving' as const)
              : submissionState.saveState === 'error' || submissionState.saveState === 'conflict'
                ? ('error' as const)
                : ('saved' as const),
      status: submissionState.status,
      canSave: canSaveDraft && submissionState.saveState === 'dirty',
      canSubmit,
      isSaving: submissionState.isSaving,
      isSubmitting: submissionState.isSubmitting,
      onSave: canSaveDraft && submissionState.saveState === 'dirty' ? () => void submissionState.save() : undefined,
      onSubmit: canSubmit ? handleOpenSubmitConfirmation : undefined,
      navigation: {
        current: currentIndex + 1,
        total: orderedQuestions.length,
        answered: answeredCount,
        canPrevious: currentIndex > 0,
        canNext: currentIndex < orderedQuestions.length - 1,
        onPrevious: () => setCurrentIndex((index) => Math.max(0, index - 1)),
        onNext: () => setCurrentIndex((index) => index + 1),
      },
      timer: policy.timeLimitSeconds
        ? {
            startedAt: attempt.created_at,
            timeLimitMinutes: Math.max(1, Math.ceil(policy.timeLimitSeconds / 60)),
            onExpire: () => {
              toast.error(t('autoSubmitting', { reason: t('autoSubmittingReason.timeExpired') }));
              void handleSubmit(true);
            },
          }
        : null,
      policy,
      initialViolationCount: 0,
      onViolation: handleViolation,
      onGuardAutoSubmit: () => {
        toast.error(t('autoSubmitting', { reason: t('autoSubmittingReason.violationThresholdExceeded') }));
        void handleSubmit(true);
      },
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
              toast.success(t('answersRecovered'));
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
    [
      canSaveDraft,
      canSubmit,
      answeredCount,
      attempt.created_at,
      currentIndex,
      handleOpenSubmitConfirmation,
      handleSubmit,
      handleViolation,
      orderedQuestions.length,
      persistence,
      policy,
      recoveredAnswers,
      showRecoveryDialog,
      submissionState,
      t,
    ],
  );

  useAttemptShellControls(shellControls);

  if (!currentQuestion) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        {title ? `${title}: ` : ''}No questions.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Alert>
        <RotateCcw className="size-4" />
        <AlertTitle>Resumed draft</AlertTitle>
        <AlertDescription>
          Last saved {formatDateTime(attempt.updated_at)}. Changes continue saving automatically while you work.
        </AlertDescription>
      </Alert>

      {historyItems.length ? <AttemptHistoryList items={historyItems} /> : null}

      {latestCompletedSubmission ? <ExamSubmissionStatePanel submission={latestCompletedSubmission} /> : null}

      <Progress
        value={progress}
        className="h-2 transition-all duration-500 ease-out"
        aria-label={t('questionProgress', { current: currentIndex + 1, total: orderedQuestions.length })}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        <div className="space-y-6">
          <ExamQuestionCard
            question={currentQuestion}
            questionNumber={currentIndex + 1}
            answer={displayAnswers}
            onAnswerChange={handleAnswerChange}
          />
        </div>

        <div className="order-first hidden lg:order-last lg:block">
          <ExamQuestionNavigation
            totalQuestions={orderedQuestions.length}
            currentQuestionIndex={currentIndex}
            answeredQuestions={answeredIndexes}
            onQuestionSelect={setCurrentIndex}
          />
        </div>
      </div>

      <ExamQuestionNavigationMobile
        totalQuestions={orderedQuestions.length}
        currentQuestionIndex={currentIndex}
        answeredQuestions={answeredIndexes}
        onQuestionSelect={setCurrentIndex}
        onPrevious={() => setCurrentIndex((index) => Math.max(0, index - 1))}
        onNext={() => setCurrentIndex((index) => Math.min(orderedQuestions.length - 1, index + 1))}
        onSubmit={handleOpenSubmitConfirmation}
        canGoNext={currentIndex < orderedQuestions.length - 1}
        canGoPrevious={currentIndex > 0}
      />

      <ExamSubmitDialog
        open={isConfirmingSubmit}
        totalQuestions={orderedQuestions.length}
        answeredCount={answeredCount}
        isSubmitting={submissionState.isSubmitting}
        labels={{
          confirmSubmission: t('confirmSubmission'),
          confirmSubmissionMessage: t('confirmSubmissionMessage'),
          totalQuestions: t('totalQuestions'),
          answered: t('answered'),
          unanswered: t('unanswered'),
          reviewQuestions: t('reviewQuestions'),
          submitting: t('submitting'),
          confirmAndSubmit: t('confirmAndSubmit'),
        }}
        onCancel={() => setIsConfirmingSubmit(false)}
        onSubmit={() => void handleSubmit()}
      />
    </div>
  );
}

function buildExamQuestions(items: AssessmentItem[]): QuestionData[] {
  return items.reduce<QuestionData[]>((questions, item) => {
    const { body } = item;

    if (body.kind === 'CHOICE') {
      questions.push({
        id: item.item_uuid,
        question_uuid: item.item_uuid,
        question_text: body.prompt,
        question_type:
          body.variant === 'TRUE_FALSE' ? 'TRUE_FALSE' : body.multiple ? 'MULTIPLE_CHOICE' : 'SINGLE_CHOICE',
        points: item.max_score,
        explanation: body.explanation ?? undefined,
        answer_options: body.options.map((option) => ({
          text: option.text,
          is_correct: option.is_correct,
          option_id: option.id,
        })),
      });
      return questions;
    }

    if (body.kind === 'MATCHING') {
      questions.push({
        id: item.item_uuid,
        question_uuid: item.item_uuid,
        question_text: body.prompt,
        question_type: 'MATCHING',
        points: item.max_score,
        explanation: body.explanation ?? undefined,
        answer_options: body.pairs.map((pair, index) => ({
          text: '',
          left: pair.left,
          right: pair.right,
          option_id: String(index),
        })),
      });
    }

    return questions;
  }, []);
}

function ExamSubmissionStatePanel({
  submission,
}: {
  submission: {
    status: 'PENDING' | 'GRADED' | 'PUBLISHED' | 'RETURNED';
    final_score?: number | null;
    grading_json?: { feedback?: string } | null;
    submitted_at?: string | null;
  };
}) {
  if (submission.status === 'PENDING') {
    return (
      <Alert>
        <AlertTitle>Submission received</AlertTitle>
        <AlertDescription>
          Submitted{submission.submitted_at ? ` on ${formatDateTime(submission.submitted_at)}` : ''}. Results stay hidden until review is complete.
        </AlertDescription>
      </Alert>
    );
  }

  if (submission.status === 'GRADED') {
    return (
      <Alert>
        <AlertTitle>Results are waiting for release</AlertTitle>
        <AlertDescription>Your latest exam has been graded and will appear after release.</AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert>
      <AlertTitle>{submission.status === 'RETURNED' ? 'Returned for revision' : 'Result available'}</AlertTitle>
      <AlertDescription className="space-y-3">
        {typeof submission.final_score === 'number' ? (
          <span className="inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium">
            <span className="rounded bg-muted px-2 py-0.5 text-xs font-medium">Score</span>
            {Math.round(submission.final_score)}%
          </span>
        ) : null}
        {submission.grading_json?.feedback ? <p className="whitespace-pre-wrap">{submission.grading_json.feedback}</p> : null}
      </AlertDescription>
    </Alert>
  );
}

function Instruction({ icon: Icon, label }: { icon: any; label: string }) {
  return (
    <li className="flex gap-2">
      <Icon className="mt-0.5 size-4 shrink-0" />
      <span>{label}</span>
    </li>
  );
}

function isAntiCheatWarningVisible(policy: typeof DEFAULT_POLICY_VIEW): boolean {
  return (
    policy.antiCheat.tabSwitchDetection ||
    policy.antiCheat.copyPasteProtection ||
    policy.antiCheat.devtoolsDetection
  );
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function toExamAnswer(question: QuestionData, answer: ItemAnswer): unknown {
  if (question.question_type === 'MATCHING' && answer.kind === 'MATCHING') {
    return Object.fromEntries(answer.matches.map((pair) => [pair.left, pair.right]));
  }

  if (answer.kind !== 'CHOICE') return null;
  if (question.question_type === 'MULTIPLE_CHOICE') return answer.selected;
  return answer.selected[0] ?? null;
}

function fromExamAnswer(question: QuestionData, answer: unknown): ItemAnswer {
  if (question.question_type === 'MATCHING') {
    const matches =
      answer && typeof answer === 'object' && !Array.isArray(answer)
        ? Object.entries(answer as Record<string, string>)
            .filter(([, right]) => typeof right === 'string' && right.length > 0)
            .map(([left, right]) => ({ left, right }))
        : [];
    return { kind: 'MATCHING', matches };
  }

  const selected = Array.isArray(answer)
    ? answer.map(String)
    : answer === null || answer === undefined || answer === ''
      ? []
      : [String(answer)];
  return { kind: 'CHOICE', selected };
}
