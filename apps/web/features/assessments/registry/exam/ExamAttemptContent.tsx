'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/api-client';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { courseKeys } from '@/hooks/courses/courseKeys';
import { useContributorStatus } from '@/hooks/useContributorStatus';
import { useExamActivity, useExamMyAttempts, useExamQuestions } from '@/features/exams/hooks/useExam';
import { examMyAttemptsQueryOptions } from '@/features/exams/queries/exams.query';
import { DEFAULT_POLICY_VIEW } from '@/features/assessments/domain/policy';
import { useAttemptShellControls } from '@/features/assessments/shell';
import { useAssessmentAttempt } from '@/features/assessments/shell/hooks/useAssessmentAttempt';
import PageLoading from '@components/Objects/Loaders/PageLoading';
import ExamQuestionNavigation, { ExamQuestionNavigationMobile } from './ExamQuestionNavigation';
import { getOrderedExamQuestions } from './questionOrder';
import { Progress } from '@components/ui/progress';
import type { KindAttemptProps } from '../index';
import ExamQuestionCard from './ExamQuestionCard';
import ExamStartPanel from './ExamStartPanel';
import ExamSubmitDialog from './ExamSubmitDialog';

// ── Inline DTO types (previously from legacy examTypes.ts) ────────────────────

interface ExamData {
  exam_uuid: string;
  title: string;
  description: string;
  settings: {
    time_limit?: number;
    attempt_limit?: number;
    shuffle_questions: boolean;
    question_limit?: number;
    access_mode: 'NO_ACCESS' | 'WHITELIST' | 'ALL_ENROLLED';
    allow_result_review: boolean;
    show_correct_answers: boolean;
    copy_paste_protection: boolean;
    tab_switch_detection: boolean;
    devtools_detection: boolean;
    right_click_disable: boolean;
    fullscreen_enforcement: boolean;
    violation_threshold?: number;
  };
  [key: string]: unknown;
}

interface AttemptData {
  id: number;
  attempt_uuid: string;
  exam_id: number;
  user_id: number;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'AUTO_SUBMITTED';
  score: number;
  max_score: number;
  started_at: string;
  finished_at?: string | null;
  question_order: (number | string)[];
  violations: { type: string; timestamp: string }[];
  answers?: Record<number, unknown>;
  [key: string]: unknown;
}

interface QuestionData {
  id: number;
  question_uuid: string;
  question_text: string;
  question_type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'MATCHING';
  points: number;
  explanation?: string;
  answer_options: { text: string; is_correct?: boolean; left?: string; right?: string; option_id?: number }[];
}

// ── Entry component ───────────────────────────────────────────────────────────

export default function ExamAttemptContent({ activityUuid, courseUuid, vm }: KindAttemptProps) {
  const t = useTranslations('Activities.ExamActivity');
  const queryClient = useQueryClient();
  const { contributorStatus } = useContributorStatus(courseUuid);
  const { data: exam, error: examError } = useExamActivity(activityUuid);
  const examUuid = exam?.exam_uuid ?? null;
  const { data: questions, error: questionsError, refetch: refetchQuestions } = useExamQuestions(examUuid);
  const { data: attempts, error: attemptsError, refetch: refetchAttempts } = useExamMyAttempts(examUuid);
  const [activeAttempt, setActiveAttempt] = useState<AttemptData | null>(null);
  const policy = vm?.policy ?? DEFAULT_POLICY_VIEW;

  useEffect(() => {
    if (activeAttempt || !attempts?.length) return;
    const inProgress = attempts.find((a: AttemptData) => a.status === 'IN_PROGRESS') ?? null;
    if (inProgress) setActiveAttempt(inProgress);
  }, [activeAttempt, attempts]);

  const handleComplete = useCallback(async () => {
    await refetchAttempts();
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: queryKeys.trail.current() }),
      queryClient.invalidateQueries({ queryKey: courseKeys.structure(courseUuid, false) }),
    ]);
    if (examUuid) await queryClient.fetchQuery(examMyAttemptsQueryOptions(examUuid));
    setActiveAttempt(null);
  }, [courseUuid, examUuid, queryClient, refetchAttempts]);

  if (examError || questionsError || attemptsError) {
    return <div className="text-destructive rounded-lg border p-6 text-sm">{t('errorLoadingExam')}</div>;
  }

  if (!exam || !questions || !attempts) {
    return <PageLoading />;
  }

  if (!activeAttempt) {
    return (
      <ExamStartPanel
        exam={exam}
        questionCount={questions.length}
        userAttempts={attempts}
        onStartExam={(attempt) => {
          setActiveAttempt(attempt);
          void refetchQuestions();
        }}
        isTeacher={contributorStatus === 'ACTIVE'}
        policy={policy}
      />
    );
  }

  return (
    <ExamTakingContent
      exam={exam}
      questions={questions}
      attempt={activeAttempt}
      policy={policy}
      onComplete={handleComplete}
    />
  );
}

// ── Taking sub-component ──────────────────────────────────────────────────────

function ExamTakingContent({
  exam,
  questions,
  attempt,
  policy,
  onComplete,
}: {
  exam: ExamData;
  questions: QuestionData[];
  attempt: AttemptData;
  policy: typeof DEFAULT_POLICY_VIEW;
  onComplete: () => void | Promise<void>;
}) {
  const t = useTranslations('Activities.ExamActivity');

  // ── Simple state (replaces examTakingReducer) ────────────────────────────
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, unknown>>(attempt.answers ?? {});
  const [isConfirmingSubmit, setIsConfirmingSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [unansweredForDialog, setUnansweredForDialog] = useState<number[]>([]);
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false);
  const [recoveredAnswers, setRecoveredAnswers] = useState<Record<number, unknown> | null>(null);

  // ── Persistence (replaces useExamPersistence) ────────────────────────────
  const persistence = useAssessmentAttempt<Record<number, unknown>>({
    attemptUuid: attempt.attempt_uuid,
    autoSaveInterval: 5000,
    expirationHours: 24,
    storageKeyPrefix: 'exam_answers_', // keep same key prefix for existing drafts
    onRestore: (recovered) => {
      if (Object.keys(answers).length === 0 && Object.keys(recovered).length > 0) {
        setRecoveredAnswers(recovered);
        setShowRecoveryDialog(true);
      }
    },
  });

  // ── Ordered questions ────────────────────────────────────────────────────
  const orderedQuestions = useMemo(
    () => getOrderedExamQuestions(questions, attempt.question_order),
    [attempt.question_order, questions],
  );
  const settings = useMemo(() => exam.settings ?? {}, [exam.settings]);
  const currentQuestion = orderedQuestions[currentIndex];

  // ── Derived ──────────────────────────────────────────────────────────────

  const isAnswered = useCallback(
    (questionId: number) => {
      const answer = answers[questionId];
      if (answer === undefined || answer === null) return false;
      if (Array.isArray(answer)) return answer.length > 0;
      if (typeof answer === 'object') return Object.keys(answer).length > 0;
      return true;
    },
    [answers],
  );

  const answeredCount = orderedQuestions.filter((q) => isAnswered(q.id)).length;
  const answeredIndexes = useMemo(
    () =>
      orderedQuestions.reduce<Set<number>>((set, q, i) => {
        if (isAnswered(q.id)) set.add(i);
        return set;
      }, new Set()),
    [isAnswered, orderedQuestions],
  );

  const progress = orderedQuestions.length > 0 ? ((currentIndex + 1) / orderedQuestions.length) * 100 : 0;

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleAnswerChange = (questionId: number, answer: unknown) => {
    const updated = { ...answers, [questionId]: answer };
    setAnswers(updated);
    persistence.saveAnswers(updated);
  };

  const handleOpenSubmitConfirmation = useCallback(() => {
    const unanswered = orderedQuestions
      .map((q, i) => (!isAnswered(q.id) ? i + 1 : null))
      .filter((n): n is number => n !== null);
    setUnansweredForDialog(unanswered);
    setIsConfirmingSubmit(true);
  }, [isAnswered, orderedQuestions]);

  const handleSubmit = useCallback(
    async (isAutoSubmit = false) => {
      if (isSubmitting) return;
      setIsConfirmingSubmit(false);
      setIsSubmitting(true);

      try {
        const response = await apiFetch(`exams/${exam.exam_uuid}/attempts/${attempt.attempt_uuid}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(answers),
        });
        if (!response.ok) throw new Error('Failed to submit exam');
        persistence.clearSavedAnswers();
        toast.success(t('examSubmittedSuccessfully'));
        await onComplete();
      } catch (error) {
        console.error('Error submitting exam:', error);
        toast.error(t('errorSubmittingExam'));
        setIsSubmitting(false);
      }
    },
    [answers, attempt.attempt_uuid, exam.exam_uuid, isSubmitting, onComplete, persistence, t],
  );

  const handleViolation = useCallback(
    async (type: string, count: number) => {
      try {
        const response = await apiFetch(`exams/${exam.exam_uuid}/attempts/${attempt.attempt_uuid}/violations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type, answers }),
        });
        const updatedAttempt = response.ok ? await response.json().catch(() => null) : null;
        if (updatedAttempt?.status === 'AUTO_SUBMITTED') {
          persistence.clearSavedAnswers();
          toast.error(t('autoSubmitting', { reason: t('autoSubmittingReason.violationThresholdExceeded') }));
          await onComplete();
        }
      } catch {
        // Best-effort violation recording — do not interrupt the attempt.
      }
    },
    [answers, attempt.attempt_uuid, exam.exam_uuid, onComplete, persistence, t],
  );

  // ── Shell controls registration ──────────────────────────────────────────

  const shellControls = useMemo(
    () => ({
      saveState: isSubmitting ? ('saving' as const) : ('saved' as const),
      canSave: false,
      canSubmit: true,
      isSaving: false,
      isSubmitting,
      onSubmit: handleOpenSubmitConfirmation,
      navigation: {
        current: currentIndex + 1,
        total: orderedQuestions.length,
        answered: answeredCount,
        canPrevious: currentIndex > 0,
        canNext: currentIndex < orderedQuestions.length - 1,
        onPrevious: () => setCurrentIndex((i) => Math.max(0, i - 1)),
        onNext: () => setCurrentIndex((i) => i + 1),
      },
      timer: settings.time_limit
        ? {
            startedAt: attempt.started_at,
            timeLimitMinutes: settings.time_limit,
            onExpire: () => {
              toast.error(t('autoSubmitting', { reason: t('autoSubmittingReason.timeExpired') }));
              void handleSubmit(true);
            },
          }
        : null,
      policy,
      initialViolationCount: attempt.violations?.length ?? 0,
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
              if (recoveredAnswers) setAnswers(recoveredAnswers);
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
      attempt.started_at,
      attempt.violations?.length,
      currentIndex,
      handleOpenSubmitConfirmation,
      handleSubmit,
      handleViolation,
      isSubmitting,
      orderedQuestions.length,
      persistence,
      policy,
      recoveredAnswers,
      settings.time_limit,
      showRecoveryDialog,
      t,
    ],
  );

  useAttemptShellControls(shellControls);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!currentQuestion) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">No questions.</div>
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
            answer={answers}
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
        onPrevious={() => setCurrentIndex((i) => Math.max(0, i - 1))}
        onNext={() => setCurrentIndex((i) => i + 1)}
        onSubmit={handleOpenSubmitConfirmation}
        canGoNext={currentIndex < orderedQuestions.length - 1}
        canGoPrevious={currentIndex > 0}
      />

      <ExamSubmitDialog
        open={isConfirmingSubmit}
        totalQuestions={orderedQuestions.length}
        answeredCount={answeredCount}
        isSubmitting={isSubmitting}
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
        onSubmit={() => void handleSubmit(false)}
      />
    </div>
  );
}
