'use client';

import { AlertCircle, ArrowLeft, ArrowRight, CheckCircle2, Repeat, XCircle } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { useTranslations } from 'next-intl';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card';
import type { AttemptData, ExamData, QuestionData } from './state/examFlowReducer';
import { Progress } from '@components/ui/progress';
import { Button } from '@components/ui/button';
import { Badge } from '@components/ui/badge';

interface ExamResultsProps {
  exam: ExamData;
  attempt: AttemptData;
  questions: QuestionData[];
  onReturnToCourse: () => void;
  onProceedToNextActivity?: () => void;
  onRetry?: () => void;
  onBackToPreScreen?: () => void;
  remainingAttempts?: number | null;
  isTeacher?: boolean;
}

export default function ExamResults({
  exam,
  attempt,
  questions,
  onReturnToCourse,
  onProceedToNextActivity,
  onRetry,
  onBackToPreScreen,
  remainingAttempts = null,
  isTeacher = false,
}: ExamResultsProps) {
  const t = useTranslations('Activities.ExamActivity');

  const settings = exam.settings || {};
  const showCorrectAnswers = settings.allow_result_review && settings.show_correct_answers;
  const allowReview = settings.allow_result_review;

  const percentage = useMemo(() => {
    return attempt.max_score > 0 ? Math.round((attempt.score / attempt.max_score) * 100) : 0;
  }, [attempt.score, attempt.max_score]);

  const orderedQuestions = useMemo(() => {
    return (attempt.question_order || [])
      .map((id: number) => questions.find((q) => q.id === id))
      .filter(Boolean) as QuestionData[];
  }, [attempt.question_order, questions]);

  const getPerformance = (percentage: number) => {
    if (percentage < 50) {
      return { grade: 2, labelKey: 'unsatisfactory' };
    }

    if (percentage <= 70) {
      return { grade: 3, labelKey: 'satisfactory' };
    }

    if (percentage <= 89) {
      return { grade: 4, labelKey: 'good' };
    }

    return { grade: 5, labelKey: 'excellent' };
  };

  const performanceSummary = useMemo(() => {
    const perf = getPerformance(percentage);
    const message = t(`performance.${perf.labelKey}`) || '';

    const color =
      perf.grade === 5
        ? 'text-green-600'
        : perf.grade === 4
          ? 'text-indigo-600'
          : perf.grade === 3
            ? 'text-purple-600'
            : 'text-orange-600';

    const ring =
      perf.grade === 5
        ? 'ring-green-200'
        : perf.grade === 4
          ? 'ring-indigo-200'
          : perf.grade === 3
            ? 'ring-purple-200'
            : 'ring-orange-200';

    const pillBg =
      perf.grade === 5
        ? 'bg-green-100 text-green-800'
        : perf.grade === 4
          ? 'bg-indigo-100 text-indigo-800'
          : perf.grade === 3
            ? 'bg-purple-100 text-purple-800'
            : 'bg-orange-100 text-orange-800';

    return {
      ...perf,
      message,
      color,
      ring,
      pillBg,
      grade: perf.grade,
    };
  }, [percentage, t]);

  const getAnswerStatus = useCallback(
    (question: QuestionData) => {
      const userAnswer = attempt.answers ? attempt.answers[question.id] : undefined;
      if (userAnswer === undefined || userAnswer === null) return 'unanswered';

      switch (question.question_type) {
        case 'SINGLE_CHOICE':
        case 'TRUE_FALSE': {
          const correctIndices = question.answer_options
            .map((opt, idx) => (opt.is_correct ? idx : -1))
            .filter((idx) => idx !== -1);
          return correctIndices.includes(userAnswer) ? 'correct' : 'incorrect';
        }

        case 'MULTIPLE_CHOICE': {
          const correctIndices = new Set(
            question.answer_options.map((opt, idx) => (opt.is_correct ? idx : -1)).filter((idx) => idx !== -1),
          );
          const userIndices = new Set(Array.isArray(userAnswer) ? userAnswer : []);
          const isCorrect =
            correctIndices.size === userIndices.size && [...correctIndices].every((idx) => userIndices.has(idx));
          return isCorrect ? 'correct' : 'incorrect';
        }

        case 'MATCHING': {
          const allCorrect = question.answer_options.every((opt) => userAnswer?.[opt.left || ''] === opt.right);
          return allCorrect ? 'correct' : 'incorrect';
        }

        default: {
          return 'unanswered';
        }
      }
    },
    [attempt.answers],
  );

  const correctCount = useMemo(
    () => orderedQuestions.filter((q) => getAnswerStatus(q) === 'correct').length,
    [orderedQuestions, getAnswerStatus],
  );
  const incorrectCount = useMemo(
    () => orderedQuestions.filter((q) => getAnswerStatus(q) === 'incorrect').length,
    [orderedQuestions, getAnswerStatus],
  );
  const unansweredCount = useMemo(
    () => orderedQuestions.filter((q) => getAnswerStatus(q) === 'unanswered').length,
    [orderedQuestions, getAnswerStatus],
  );

  const renderUserAnswer = (question: QuestionData) => {
    const userAnswer = attempt.answers?.[question.id];

    if (userAnswer === undefined || userAnswer === null) {
      return <span className="text-muted-foreground">{t('notAnswered')}</span>;
    }

    switch (question.question_type) {
      case 'SINGLE_CHOICE':
      case 'TRUE_FALSE': {
        return <span className="font-medium">{question.answer_options[userAnswer]?.text || t('invalidAnswer')}</span>;
      }

      case 'MULTIPLE_CHOICE': {
        return (
          <div className="space-y-1">
            {Array.isArray(userAnswer) && userAnswer.length > 0 ? (
              userAnswer.map((idx: number) => (
                <div key={idx}>{question.answer_options[idx]?.text ?? t('invalidAnswer')}</div>
              ))
            ) : (
              <span className="text-muted-foreground">{t('notAnswered')}</span>
            )}
          </div>
        );
      }

      case 'MATCHING': {
        return (
          <div className="space-y-1">
            {Object.entries(userAnswer).map(([left, right]) => (
              <div key={left}>
                {left} → {right as string}
              </div>
            ))}
          </div>
        );
      }

      default: {
        return null;
      }
    }
  };

  const renderCorrectAnswer = (question: QuestionData) => {
    if (!showCorrectAnswers) return null;

    switch (question.question_type) {
      case 'SINGLE_CHOICE':
      case 'TRUE_FALSE':
      case 'MULTIPLE_CHOICE': {
        const correctOptions = question.answer_options.filter((opt) => opt.is_correct);
        return (
          <div className="space-y-1">
            {correctOptions.map((opt, idx) => (
              <div
                key={idx}
                className="text-green-700"
              >
                {opt.text}
              </div>
            ))}
          </div>
        );
      }

      case 'MATCHING': {
        return (
          <div className="space-y-1">
            {question.answer_options.map((opt, idx) => (
              <div
                key={idx}
                className="text-green-700"
              >
                {opt.left} → {opt.right}
              </div>
            ))}
          </div>
        );
      }

      default: {
        return null;
      }
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6">
      {/* Score Card */}
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br px-6 py-8 text-center">
          <div className="inline-flex items-center justify-center gap-3 text-4xl font-bold text-blue-900">
            {t('examCompleted')}
          </div>

          <div className="mt-6 flex items-center justify-center gap-6">
            <div
              className={`bg-card flex h-28 w-28 items-center justify-center rounded-full shadow-md ring-4 ${performanceSummary.ring}`}
              role="img"
              aria-label={`${percentage}%`}
            >
              <div className={`text-4xl font-extrabold ${performanceSummary.color}`}>{percentage}%</div>
            </div>

            <div className="flex flex-col items-start">
              <div
                className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${performanceSummary.pillBg}`}
              >
                {performanceSummary.message}
              </div>
            </div>
          </div>
        </div>

        <CardContent className="space-y-6">
          {/* Score Display */}
          <div
            className="text-center"
            role="status"
            aria-live="polite"
          >
            <div className="text-lg text-gray-600">
              {t('scoreDetails', { score: attempt.score, max: attempt.max_score })}
            </div>

            <div className="mt-3">
              <Progress
                value={percentage}
                className="h-3"
                aria-label={t('scoreProgress', { percentage })}
              />
            </div>
          </div>

          {/* Statistics */}
          <div className="grid gap-5 md:grid-cols-3">
            <div className="group relative overflow-hidden rounded-xl border border-green-200 bg-gradient-to-br from-green-50 to-green-100/50 p-6 shadow-sm transition-all hover:shadow-md hover:shadow-green-100">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-green-600 shadow-lg">
                  <CheckCircle2 className="h-8 w-8 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-green-700">{t('correct')}</p>
                  <p className="text-3xl font-bold text-green-600">{correctCount}</p>
                </div>
              </div>
              <div className="absolute right-0 bottom-0 h-20 w-20 translate-x-8 translate-y-8 rounded-full bg-green-600/10" />
            </div>

            <div className="group relative overflow-hidden rounded-xl border border-red-200 bg-gradient-to-br from-red-50 to-red-100/50 p-6 shadow-sm transition-all hover:shadow-md hover:shadow-red-100">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-red-600 shadow-lg">
                  <XCircle className="h-8 w-8 text-white" />
                </div>
                <div>
                  <p className="text-sm font-medium text-red-700">{t('incorrect')}</p>
                  <p className="text-3xl font-bold text-red-600">{incorrectCount}</p>
                </div>
              </div>
              <div className="absolute right-0 bottom-0 h-20 w-20 translate-x-8 translate-y-8 rounded-full bg-red-600/10" />
            </div>

            <div className="group border-border relative overflow-hidden rounded-xl border bg-gradient-to-br from-gray-50 to-gray-100/50 p-6 shadow-sm transition-all hover:shadow-md hover:shadow-gray-100">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gray-600 shadow-lg">
                  <AlertCircle className="h-8 w-8 text-white" />
                </div>
                <div>
                  <p className="text-foreground text-sm font-medium">{t('unanswered')}</p>
                  <p className="text-3xl font-bold text-gray-600">{unansweredCount}</p>
                </div>
              </div>
              <div className="absolute right-0 bottom-0 h-20 w-20 translate-x-8 translate-y-8 rounded-full bg-gray-600/10" />
            </div>
          </div>

          {/* Violations */}
          {attempt.violations && attempt.violations.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="font-semibold text-amber-900">
                {t('violationsRecorded', { count: attempt.violations.length })}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Answer Review */}
      {allowReview && (
        <div className="space-y-4">
          <h2 className="text-2xl font-bold">{t('answerReview')}</h2>

          {orderedQuestions.map((question, index) => {
            const status = getAnswerStatus(question);

            return (
              <Card key={question.id}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{t('questionNumber', { number: index + 1 })}</CardTitle>
                      <div className="text-muted-foreground mt-1 text-sm">
                        {t('questionType.' + question.question_type)} · {t('pointsValue', { points: question.points })}
                      </div>
                    </div>
                    <Badge
                      variant={status === 'correct' ? 'default' : status === 'incorrect' ? 'destructive' : 'secondary'}
                      aria-label={t(status)}
                    >
                      {status === 'correct' && <CheckCircle2 className="mr-1 h-3 w-3" />}
                      {status === 'incorrect' && <XCircle className="mr-1 h-3 w-3" />}
                      {status === 'unanswered' && <AlertCircle className="mr-1 h-3 w-3" />}
                      {t(status)}
                    </Badge>
                  </div>
                  <CardDescription className="text-foreground mt-3 text-base">{question.question_text}</CardDescription>
                </CardHeader>

                <CardContent className="space-y-4">
                  <div>
                    <p className="mb-2 text-sm font-semibold text-gray-600">{t('yourAnswer')}</p>
                    <div className="bg-muted rounded-lg p-3">{renderUserAnswer(question)}</div>
                  </div>

                  {showCorrectAnswers && status !== 'correct' && (
                    <div>
                      <p className="mb-2 text-sm font-semibold text-green-600">{t('correctAnswer')}</p>
                      <div className="rounded-lg bg-green-50 p-3">{renderCorrectAnswer(question)}</div>
                    </div>
                  )}

                  {question.explanation && status !== 'correct' && (
                    <div className="bg-primary/10 rounded-lg border-l-4 border-blue-500 p-3">
                      <p className="text-sm font-semibold text-blue-900">{t('explanation')}</p>
                      <p className="text-sm text-blue-800">{question.explanation}</p>
                    </div>
                  )}

                  <div className="text-sm text-gray-600">{t('pointsValue', { points: question.points })}</div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-center space-x-4">
        {onBackToPreScreen && (
          <Button
            size="lg"
            variant="ghost"
            onClick={onBackToPreScreen}
            aria-label={t('backToExam')}
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            {t('backToExam')}
          </Button>
        )}

        {onRetry && (
          <Button
            size="lg"
            variant="outline"
            onClick={onRetry}
            disabled={!isTeacher && remainingAttempts !== null && remainingAttempts <= 0}
            aria-disabled={!isTeacher && remainingAttempts !== null && remainingAttempts <= 0}
            title={
              !isTeacher && remainingAttempts !== null && remainingAttempts <= 0 ? t('noAttemptsRemaining') : undefined
            }
            aria-label={t('retryExam')}
          >
            <Repeat className="mr-1 h-4 w-4" />
            {remainingAttempts !== null && remainingAttempts !== undefined
              ? t('retryExamRemaining', { remaining: remainingAttempts })
              : t('retryExam')}
          </Button>
        )}

        <Button
          size="lg"
          onClick={onProceedToNextActivity ?? onReturnToCourse}
          aria-label={onProceedToNextActivity ? t('proceedToNextActivity') : t('returnToCourse')}
        >
          {onProceedToNextActivity ? (
            <>
              {t('proceedToNextActivity') || 'Next activity'}
              <ArrowRight className="ml-1 h-4 w-4" />
            </>
          ) : (
            t('returnToCourse')
          )}
        </Button>
      </div>
    </div>
  );
}
