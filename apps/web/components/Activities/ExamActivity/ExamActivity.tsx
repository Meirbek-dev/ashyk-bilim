'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import { apiFetch } from '@/lib/api-client';
import { buildCourseActivityIndex, normalizeActivityUuid } from '@/lib/course-activity-index';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { getAbsoluteUrl } from '@/services/config/config';
import { useContributorStatus } from '@/hooks/useContributorStatus';
import { courseKeys } from '@/hooks/courses/courseKeys';
import { useExamActivity, useExamMyAttempts, useExamQuestions } from '@/features/exams/hooks/useExam';
import { examMyAttemptsQueryOptions } from '@/features/exams/queries/exams.query';
import PageLoading from '@components/Objects/Loaders/PageLoading';
import type { AttemptData } from './state/examFlowReducer';
import { examFlowReducer } from './state/examFlowReducer';
import ExamTakingInterface from './ExamTakingInterface';
import { examActions } from './state/examActions';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import ExamPreScreen from './ExamPreScreen';
import ExamResults from './ExamResults';
import ExamLayout from './ExamLayout';

interface ActivityObject {
  activity_uuid: string;
  name: string;
}

interface ChapterActivity {
  activity_uuid: string;
}

interface CourseChapter {
  activities?: ChapterActivity[];
}

interface CourseObject {
  course_uuid: string;
  withUnpublishedActivities?: boolean;
  chapters?: CourseChapter[];
}

interface ExamActivityProps {
  activity: ActivityObject;
  course: CourseObject;
}

export default function ExamActivity({ activity, course }: ExamActivityProps) {
  const t = useTranslations('Activities.ExamActivity');
  const { contributorStatus } = useContributorStatus(course.course_uuid);
  const queryClient = useQueryClient();

  // Centralized state management with reducer
  const [state, dispatch] = useReducer(examFlowReducer, { phase: 'loading' });
  const isCompletingRef = useRef(false);

  const isTeacher = contributorStatus === 'ACTIVE';

  // Fetch exam data
  const { data: exam, error: examError } = useExamActivity(activity.activity_uuid);

  // Safe exam uuid reference to avoid accessing property on undefined
  const examUuid = exam?.exam_uuid ?? null;

  // Fetch questions
  const { data: questions, error: questionsError, refetch: mutateQuestions } = useExamQuestions(examUuid);

  // Fetch user's attempts
  const { data: userAttempts, error: attemptsError, refetch: mutateAttempts } = useExamMyAttempts(examUuid);

  // Update state based on loaded data
  useEffect(() => {
    if (examError || questionsError || attemptsError) {
      dispatch(examActions.setError({ message: t('errorLoadingExam'), retryable: true }));
      toast.error(t('errorLoadingExam'));
      return;
    }

    if (!exam || !questions) {
      dispatch(examActions.setLoading());
      return;
    }

    const userAttemptsList = userAttempts || [];

    // Check for in-progress attempt (skip if completion handler is running)
    const inProgressAttempt = userAttemptsList.find((a: AttemptData) => a.status === 'IN_PROGRESS');
    if (inProgressAttempt && state.phase !== 'taking' && !isCompletingRef.current) {
      // Ensure we have pre-exam state set before starting
      if (state.phase === 'loading') {
        dispatch(examActions.setPreExam(exam, questions, userAttemptsList));
      }
      dispatch(examActions.startExam(inProgressAttempt));
      return;
    }

    // Default to pre-exam if we're in loading state
    if (state.phase === 'loading') {
      dispatch(examActions.setPreExam(exam, questions, userAttemptsList));
    }
  }, [exam, questions, userAttempts, examError, questionsError, attemptsError, t, state.phase]);

  const handleStartExam = useCallback(
    (attempt: AttemptData) => {
      dispatch(examActions.startExam(attempt));
      void mutateQuestions?.();
    },
    [mutateQuestions],
  );

  const handleCompleteExam = useCallback(async () => {
    isCompletingRef.current = true;

    // Refresh attempts data
    await mutateAttempts();

    // Revalidate trail data
    try {
      await queryClient.invalidateQueries({ queryKey: queryKeys.trail.current() });
    } catch (error) {
      console.warn('Failed to revalidate trail after exam completion', error);
    }

    // Revalidate course meta
    try {
      const withUnpublishedActivities = course?.withUnpublishedActivities || false;
      await queryClient.invalidateQueries({
        queryKey: courseKeys.structure(course?.course_uuid, withUnpublishedActivities),
      });
    } catch (error) {
      console.warn('Failed to revalidate course meta after exam completion', error);
    }

    const completedAttempt = examUuid ? await queryClient.fetchQuery(examMyAttemptsQueryOptions(examUuid)) : [];

    const lastAttempt = completedAttempt[0];
    dispatch(examActions.submitExam(lastAttempt));
    isCompletingRef.current = false;
  }, [mutateAttempts, course, examUuid, queryClient]);

  const router = useRouter();

  const handleReturnToCourse = useCallback(() => {
    const courseuuid = course.course_uuid?.replace('course_', '');
    router.push(`/course/${courseuuid}`);
  }, [course, router]);

  const courseActivityIndex = useMemo(() => buildCourseActivityIndex(course?.chapters), [course?.chapters]);
  const currentCourseActivityIndex =
    courseActivityIndex.indexByCleanUuid.get(normalizeActivityUuid(activity.activity_uuid)) ?? -1;
  const nextCourseActivity =
    currentCourseActivityIndex >= 0 && currentCourseActivityIndex < courseActivityIndex.allActivities.length - 1
      ? courseActivityIndex.allActivities[currentCourseActivityIndex + 1]
      : null;

  const handleProceedToNextActivity = useCallback(() => {
    try {
      if (!nextCourseActivity) {
        toast.info(t('noNextActivity') || 'No next activity');
        return;
      }

      const cleanCourseUuid = course.course_uuid?.replace('course_', '');
      router.push(`${getAbsoluteUrl('')}/course/${cleanCourseUuid}/activity/${nextCourseActivity.cleanUuid}`);
    } catch (error) {
      console.error('Failed to navigate to next activity', error);
      toast.error(t('navigationError') || 'Navigation failed');
    }
  }, [course.course_uuid, nextCourseActivity, router, t]);

  const handleBackToPreExam = useCallback(() => {
    if (state.phase === 'results') {
      dispatch(examActions.backToPreExam(userAttempts || []));
    }
  }, [state.phase, userAttempts]);

  const handleReviewAttempt = useCallback((attempt: AttemptData) => {
    dispatch(examActions.reviewAttempt(attempt));
  }, []);

  const handleExitReview = useCallback(() => {
    dispatch(examActions.exitReview());
    mutateAttempts();
  }, [mutateAttempts]);

  if (state.phase === 'loading' || !exam || !questions) {
    return <PageLoading />;
  }

  // Error state
  if (state.phase === 'error') {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-destructive">{t('errorLoadingExam')}</p>
          <Button
            onClick={() => dispatch(examActions.retry())}
            className="mt-4"
          >
            {t('tryAgain')}
          </Button>
        </div>
      </div>
    );
  }

  if (state.phase === 'pre-exam') {
    return (
      <ExamLayout title={state.exam.title}>
        <ExamPreScreen
          exam={state.exam}
          questionCount={state.questions.length}
          userAttempts={state.userAttempts}
          onStartExam={handleStartExam}
          onReviewAttempt={handleReviewAttempt}
          isTeacher={isTeacher}
        />
      </ExamLayout>
    );
  }

  if (state.phase === 'taking') {
    return (
      <ExamLayout title={state.exam.title}>
        <ExamTakingInterface
          exam={state.exam}
          questions={state.questions}
          attempt={state.attempt}
          onComplete={handleCompleteExam}
        />
      </ExamLayout>
    );
  }

  const handleRetry = async () => {
    try {
      const response = await apiFetch(`exams/${exam.exam_uuid}/attempts/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        toast.error(error.detail || t('errorStartingExam'));
        return;
      }

      const attempt = await response.json();
      toast.success(t('examStarted'));
      handleStartExam(attempt);
    } catch (error) {
      console.error('Failed to start retry attempt:', error);
      toast.error(t('errorStartingExam'));
    }
  };

  if (state.phase === 'results' || state.phase === 'reviewing') {
    const attempts = userAttempts || [];
    const remainingAttempts =
      isTeacher || !state.exam?.settings?.attempt_limit || state.exam.settings.attempt_limit === 0
        ? null
        : state.exam.settings.attempt_limit - attempts.length;

    return (
      <ExamLayout title={state.exam.title}>
        <ExamResults
          exam={state.exam}
          attempt={state.attempt}
          questions={state.questions}
          onReturnToCourse={handleReturnToCourse}
          onProceedToNextActivity={state.phase === 'results' ? handleProceedToNextActivity : undefined}
          onRetry={state.phase === 'results' ? handleRetry : undefined}
          onBackToPreScreen={state.phase === 'reviewing' ? handleExitReview : handleBackToPreExam}
          remainingAttempts={remainingAttempts}
          isTeacher={isTeacher}
        />
      </ExamLayout>
    );
  }

  return <PageLoading />;
}
