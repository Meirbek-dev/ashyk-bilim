'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { queryKeys } from '@/lib/react-query/queryKeys';
import { courseKeys } from '@/hooks/courses/courseKeys';
import { useContributorStatus } from '@/hooks/useContributorStatus';
import { DEFAULT_POLICY_VIEW } from '@/features/assessments/domain/policy';
import { isAnswered as isItemAnswered, type AssessmentItem, type ItemAnswer } from '@/features/assessments/domain/items';
import { useAttemptShellControls } from '@/features/assessments/shell';
import { useAssessmentAttempt } from '@/features/assessments/shell/hooks/useAssessmentAttempt';
import { useAssessmentSubmission } from '@/features/assessments/hooks/useAssessmentSubmission';
import PageLoading from '@components/Objects/Loaders/PageLoading';
import ExamQuestionNavigation, { ExamQuestionNavigationMobile } from './ExamQuestionNavigation';
import { getOrderedExamQuestions } from './questionOrder';
import { Progress } from '@components/ui/progress';
import type { KindAttemptProps } from '../index';
import ExamQuestionCard from './ExamQuestionCard';
import ExamStartPanel from './ExamStartPanel';
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

  if (!submissionState.draft) {
    return (
      <ExamStartPanel
        assessmentUuid={assessmentUuid}
        title={vm.title}
        description={vm.description}
        questionCount={questions.length}
        userAttempts={submissionState.submissions.filter((submission) => submission.status !== 'DRAFT')}
        attemptLimit={policy.maxAttempts}
        timeLimitMinutes={
          typeof policy.timeLimitSeconds === 'number' ? Math.max(1, Math.ceil(policy.timeLimitSeconds / 60)) : null
        }
        onStartExam={() => {
          void handleComplete();
        }}
        isTeacher={contributorStatus === 'ACTIVE'}
        policy={policy}
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
}: {
  title: string;
  questions: QuestionData[];
  submissionState: ReturnType<typeof useAssessmentSubmission>;
  attempt: NonNullable<ReturnType<typeof useAssessmentSubmission>['draft']>;
  policy: typeof DEFAULT_POLICY_VIEW;
  onComplete: () => void | Promise<void>;
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
  const questionById = useMemo(() => new Map(orderedQuestions.map((question) => [question.id, question])), [orderedQuestions]);

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
          : submissionState.saveState === 'dirty'
            ? ('unsaved' as const)
            : submissionState.saveState === 'saving'
              ? ('saving' as const)
              : submissionState.saveState === 'error' || submissionState.saveState === 'conflict'
                ? ('error' as const)
                : ('saved' as const),
      status: submissionState.status,
      canSave: false,
      canSubmit: true,
      isSaving: submissionState.isSaving,
      isSubmitting: submissionState.isSubmitting,
      onSubmit: handleOpenSubmitConfirmation,
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
    }),
    [
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
  return items.flatMap((item) => {
    if (item.kind === 'CHOICE') {
      return [
        {
          id: item.item_uuid,
          question_uuid: item.item_uuid,
          question_text: item.body.prompt,
          question_type: item.body.multiple ? 'MULTIPLE_CHOICE' : 'SINGLE_CHOICE',
          points: item.max_score,
          answer_options: item.body.options.map((option) => ({
            text: option.text,
            is_correct: option.is_correct,
            option_id: option.id,
          })),
        },
      ];
    }

    if (item.kind === 'MATCHING') {
      return [
        {
          id: item.item_uuid,
          question_uuid: item.item_uuid,
          question_text: item.body.prompt,
          question_type: 'MATCHING',
          points: item.max_score,
          answer_options: item.body.pairs.map((pair, index) => ({
            text: '',
            left: pair.left,
            right: pair.right,
            option_id: String(index),
          })),
        },
      ];
    }

    return [];
  });
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
