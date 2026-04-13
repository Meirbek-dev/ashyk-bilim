'use client';

import { apiFetch } from '@/lib/api-client';

import { createInitialTakingState, examTakingReducer } from './state/examTakingReducer';
import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { useExamPersistence } from '@/hooks/useExamPersistence';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import ExamTimer from './ExamTimer';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from '@components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card';
import type { AttemptData, ExamData, QuestionData } from './state/examFlowReducer';
import { RadioGroup, RadioGroupItem } from '@components/ui/radio-group';
import { Alert, AlertDescription } from '@components/ui/alert';
import { useTestGuard } from '@/hooks/useTestGuard';
import { Progress } from '@components/ui/progress';
import { Checkbox } from '@components/ui/checkbox';
import { Button } from '@components/ui/button';
import { Label } from '@components/ui/label';

interface ExamTakingInterfaceProps {
  exam: ExamData;
  questions: QuestionData[];
  attempt: AttemptData;
  onComplete: () => void;
}

export default function ExamTakingInterface({ exam, questions, attempt, onComplete }: ExamTakingInterfaceProps) {
  const t = useTranslations('Activities.ExamActivity');

  // Centralized state management with reducer,
  const [state, dispatch] = useReducer(
    examTakingReducer,
    createInitialTakingState(0, {}, attempt.violations?.length || 0),
  );

  // Fullscreen state (separate from main state machine)
  const [isFullscreen, setIsFullscreen] = useState(false);
  const examContainerRef = useRef<HTMLDivElement>(null);

  // Answer persistence with auto-save and recovery,
  const persistence = useExamPersistence({
    attemptUuid: attempt.attempt_uuid,
    autoSaveInterval: 5000, // Auto-save every 5 seconds,
    expirationHours: 24,
    onRestore: (recoveredAnswers) => {
      // Offer recovery on mount if no current answers and we have recovered data,
      const currentAnswers =
        state.mode === 'answering' ||
        state.mode === 'confirming-submit' ||
        state.mode === 'violation-warning' ||
        state.mode === 'fullscreen-warning'
          ? state.answers
          : {};
      if (Object.keys(currentAnswers).length === 0 && Object.keys(recoveredAnswers).length > 0) {
        dispatch({ type: 'SHOW_RECOVERY_PROMPT', recoveredAnswers });
      }
    },
  });

  const settings = exam.settings || {};
  const orderedQuestions = attempt.question_order
    .map((id) => questions.find((q) => q.id === id))
    .filter(Boolean) as QuestionData[];

  // Extract current state,
  const currentIndex = state.mode === 'submitting' ? 0 : state.currentIndex;
  const answers = state.mode === 'submitting' ? state.answers : state.mode === 'recovery-prompt' ? {} : state.answers;
  const isSubmitting = state.mode === 'submitting';
  const showConfirmation = state.mode === 'confirming-submit';
  const { violationCount } = state;
  const violationDialogOpen = state.mode === 'violation-warning';
  const currentViolation = state.mode === 'violation-warning' ? state.violation : null;
  const showRecoveryDialog = state.mode === 'recovery-prompt';

  const currentQuestion = orderedQuestions[currentIndex];
  const progress = ((currentIndex + 1) / orderedQuestions.length) * 100;

  const handleSubmit = useCallback(
    async (isAutoSubmit = false) => {
      if (state.mode === 'submitting') return;

      dispatch({ type: 'START_SUBMIT' });

      try {
        const submitAnswers = state.mode === 'confirming-submit' ? state.answers : {};
        const response = await apiFetch(`exams/${exam.exam_uuid}/attempts/${attempt.attempt_uuid}/submit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(submitAnswers),
        });

        if (!response.ok) {
          throw new Error('Failed to submit exam');
        }

        // Clear saved answers on successful submission,
        persistence.clearSavedAnswers();

        toast.success(t('examSubmittedSuccessfully'));
        onComplete();
      } catch (error) {
        console.error('Error submitting exam:', error);
        toast.error(t('errorSubmittingExam'));
        dispatch({ type: 'RESET_TO_ANSWERING' });
      }
    },
    [state, exam.exam_uuid, attempt.attempt_uuid, onComplete, t, persistence],
  );

  // Anti-cheating with useTestGuard,
  const handleViolation = useCallback(
    async (type: string, count: number) => {
      dispatch({ type: 'RECORD_VIOLATION', violation: { type, count } });

      // Record violation on server,
      try {
        await apiFetch(`exams/${exam.exam_uuid}/attempts/${attempt.attempt_uuid}/violations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type }),
        });

        // Check if threshold reached,
        const threshold = settings.violation_threshold;
        if (threshold && count >= threshold) {
          // Auto-submit on threshold,
          toast.error(t('autoSubmitting', { reason: t('autoSubmittingReason.violationThresholdExceeded') }));
          void handleSubmit(true);
        }
      } catch (error) {
        console.error('Failed to record violation:', error);
      }
    },
    [exam.exam_uuid, attempt.attempt_uuid, settings.violation_threshold, handleSubmit, t],
  );

  useTestGuard({
    enabled: true,
    preventCopy: settings.copy_paste_protection,
    preventRightClick: settings.right_click_disable,
    trackBlur: settings.tab_switch_detection,
    trackDevTools: settings.devtools_detection,
    maxViolations: settings.violation_threshold || 999,
    // Wrap the async handler to avoid passing a Promise-returning function to the hook,
    onViolation: (type, count) => {
      void handleViolation(type, count);
    },
    // Debounce options to reduce false positives,
    blurDebounceMs: 500, // Wait 500ms before reporting blur (user might switch back quickly)
    devToolsThreshold: 180, // More conservative threshold for DevTools detection,
    devToolsCheckIntervalMs: 2000, // Check less frequently to avoid performance impact
  });

  // Fullscreen enforcement with grace period and better UX,
  useEffect(() => {
    if (!settings.fullscreen_enforcement) return;

    let fullscreenExitTimeout: NodeJS.Timeout | null = null;
    let fullscreenSupported = true;
    let userInitiatedExit = false;

    const requestFullscreen = async () => {
      try {
        if (examContainerRef.current && !document.fullscreenElement) {
          await examContainerRef.current.requestFullscreen();
          setIsFullscreen(true);
          fullscreenSupported = true;
        }
      } catch (error: any) {
        console.warn('Fullscreen request failed:', error);
        fullscreenSupported = false;

        // Show warning but don't penalize if browser doesn't support fullscreen,
        if (error.name === 'TypeError' || error.message?.includes('not supported')) {
          toast.warning(t('fullscreenNotSupported'));
        } else {
          // User denied or other error - show message but allow exam to continue,
          toast.info(t('fullscreenRecommended'));
        }
      }
    };

    const handleFullscreenChange = () => {
      const inFullscreen = Boolean(document.fullscreenElement);
      setIsFullscreen(inFullscreen);

      if (!inFullscreen && settings.fullscreen_enforcement && fullscreenSupported) {
        // Clear any existing timeout,
        if (fullscreenExitTimeout) {
          clearTimeout(fullscreenExitTimeout);
        }

        // Grace period: give user 3 seconds to return to fullscreen before reporting violation,
        fullscreenExitTimeout = setTimeout(() => {
          // Only report if still not in fullscreen after grace period,
          if (!document.fullscreenElement && !userInitiatedExit) {
            toast.warning(t('fullscreenExited'));
            void handleViolation('FULLSCREEN_EXIT', state.violationCount + 1);

            // Optionally try to re-enter fullscreen,
            if (settings.fullscreen_enforcement) {
              void requestFullscreen();
            }
          }
        }, 3000); // 3 second grace period
      } else if (inFullscreen && fullscreenExitTimeout) {
        // User returned to fullscreen within grace period - cancel violation,
        clearTimeout(fullscreenExitTimeout);
        fullscreenExitTimeout = null;
      }
    };

    // Request fullscreen on mount,
    void requestFullscreen();
    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      if (fullscreenExitTimeout) {
        clearTimeout(fullscreenExitTimeout);
      }
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      // Mark exit as user-initiated when component unmounts (exam ended)
      userInitiatedExit = true;
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => {
          /* ignore errors on cleanup */
        });
      }
    };
  }, [settings.fullscreen_enforcement, handleViolation, t, state.violationCount]);

  const handleAnswerChange = (questionId: number, answer: any) => {
    dispatch({ type: 'ANSWER_QUESTION', questionId, answer });
    // Persist answers to localStorage,
    const currentAnswers =
      state.mode === 'answering' || state.mode === 'violation-warning' || state.mode === 'fullscreen-warning'
        ? state.answers
        : {};
    const updated = { ...currentAnswers, [questionId]: answer };
    persistence.saveAnswers(updated);
  };

  const renderQuestion = (question: QuestionData) => {
    const questionId = question.id;

    switch (question.question_type) {
      case 'SINGLE_CHOICE':
      case 'TRUE_FALSE': {
        // Ensure we only treat explicit numeric or boolean answers as selected for radios.
        // This prevents accidental pre-selection when stored value is malformed or empty.
        const rawAnswer = answers[questionId];
        const radioValue = (() => {
          if (rawAnswer === undefined || rawAnswer === null || rawAnswer === '') return '';
          if (typeof rawAnswer === 'boolean') return rawAnswer ? '1' : '0';
          if (typeof rawAnswer === 'number') return String(rawAnswer);
          if (typeof rawAnswer === 'string') {
            const parsed = Number.parseInt(rawAnswer, 10);
            return Number.isNaN(parsed) ? '' : String(parsed);
          }
          return '';
        })();

        return (
          <RadioGroup
            value={radioValue}
            onValueChange={(value) =>
              handleAnswerChange(questionId, typeof value === 'string' ? Number.parseInt(value, 10) : Number(value))
            }
            className="space-y-2"
            aria-labelledby={`question-title-${questionId}`}
          >
            {question.answer_options.map((option, index) => (
              <div
                key={index}
                className="border-border hover:bg-muted flex items-center space-x-3 rounded-lg border p-4 transition-colors hover:border-gray-300"
              >
                <RadioGroupItem
                  value={index.toString()}
                  id={`q${questionId}-${index}`}
                />
                <Label
                  htmlFor={`q${questionId}-${index}`}
                  className="flex-1 cursor-pointer text-base leading-relaxed"
                >
                  {option.text}
                </Label>
              </div>
            ))}
          </RadioGroup>
        );
      }

      case 'MULTIPLE_CHOICE': {
        const selectedAnswers = answers[questionId] || [];
        return (
          <div
            className="space-y-2"
            role="group"
            aria-labelledby={`question-title-${questionId}`}
          >
            {question.answer_options.map((option, index) => (
              <div
                key={index}
                className="border-border hover:bg-muted flex items-center space-x-3 rounded-lg border p-4 transition-colors hover:border-gray-300"
              >
                <Checkbox
                  id={`q${questionId}-${index}`}
                  checked={selectedAnswers.includes(index)}
                  onCheckedChange={(checked) => {
                    const newAnswers = checked
                      ? [...selectedAnswers, index]
                      : selectedAnswers.filter((i: number) => i !== index);
                    handleAnswerChange(questionId, newAnswers);
                  }}
                />
                <Label
                  htmlFor={`q${questionId}-${index}`}
                  className="flex-1 cursor-pointer text-base leading-relaxed"
                >
                  {option.text}
                </Label>
              </div>
            ))}
          </div>
        );
      }

      case 'MATCHING': {
        const matchAnswers = answers[questionId] || {};
        return (
          <div className="space-y-3">
            {question.answer_options.map((option, index) => {
              const matchOptions = question.answer_options.map((opt) => ({
                value: opt.right ?? '',
                label: opt.right,
              }));
              return (
                <div
                  key={index}
                  className="border-border flex items-center gap-4 rounded-lg border p-4"
                >
                  <span className="min-w-[200px] text-base font-medium">{option.left}</span>
                  <span className="text-gray-400">→</span>
                  <div className="flex-1">
                    <Select
                      value={matchAnswers[option.left || ''] ?? ''}
                      onValueChange={(val) =>
                        handleAnswerChange(questionId, {
                          ...matchAnswers,
                          [option.left || '']: val,
                        })
                      }
                      items={matchOptions}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={t('selectMatch')} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          {matchOptions.map((opt) => (
                            <SelectItem
                              key={opt.value}
                              value={opt.value}
                            >
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              );
            })}
          </div>
        );
      }

      default: {
        return <p>{t('unsupportedQuestionType')}</p>;
      }
    }
  };

  const isAnswered = (questionId: number) => {
    const answer = answers[questionId];
    if (answer === undefined || answer === null) return false;
    if (Array.isArray(answer)) return answer.length > 0;
    if (typeof answer === 'object') return Object.keys(answer).length > 0;
    return true;
  };

  const answeredCount = orderedQuestions.filter((q) => isAnswered(q.id)).length;
  const remainingViolations = settings.violation_threshold
    ? Math.max(settings.violation_threshold - violationCount, 0)
    : undefined;

  return (
    <div
      ref={examContainerRef}
      className="mx-auto max-w-full space-y-6 p-4 md:p-6"
    >
      {/* Header with Timer, Progress, and primary actions */}
      <div className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2
            id={`exam-title-${attempt.attempt_uuid}`}
            className="text-xl font-bold md:text-2xl"
          >
            {exam.title}
          </h2>
          <p className="text-sm text-gray-600">
            {t('questionProgress', {
              current: currentIndex + 1,
              total: orderedQuestions.length,
            })}
          </p>
        </div>

        <div className="flex items-center gap-3">
          {settings.time_limit && attempt.started_at && (
            <ExamTimer
              startedAt={attempt.started_at}
              timeLimitMinutes={settings.time_limit}
              onExpire={() => {
                toast.error(t('autoSubmitting', { reason: t('autoSubmittingReason.timeExpired') }));
                void handleSubmit(true);
              }}
            />
          )}

          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const unansweredQuestions = orderedQuestions
                .map((q, idx) => (!isAnswered(q.id) ? idx + 1 : null))
                .filter((n): n is number => n !== null);
              dispatch({ type: 'SHOW_SUBMIT_CONFIRMATION', unansweredQuestions });
            }}
            className="hidden md:inline-flex"
          >
            {t('reviewAndSubmit')}
          </Button>
        </div>
      </div>

      <Progress
        value={progress}
        className="h-2 transition-all duration-500 ease-out"
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('questionProgress', {
          current: currentIndex + 1,
          total: orderedQuestions.length,
        })}
      />

      {/* Violation Warning */}
      {violationCount > 0 && (
        <Alert
          variant="destructive"
          role="status"
          aria-live="polite"
        >
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            {t('violationWarning', {
              count: violationCount,
              max: settings.violation_threshold || t('unlimited'),
              remaining: remainingViolations ?? '',
            })}
          </AlertDescription>
        </Alert>
      )}

      {/* Violation Dialog */}
      <AlertDialog
        open={violationDialogOpen}
        onOpenChange={(open) => !open && dispatch({ type: 'DISMISS_VIOLATION' })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <AlertTriangle className="text-destructive size-6" />
            </AlertDialogMedia>
            <AlertDialogTitle>{t('violationDialogTitle', { type: currentViolation?.type ?? '' })}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('violationDialogDescription', {
                type: currentViolation?.type ?? '',
                count: currentViolation?.count ?? 0,
                max: settings.violation_threshold || t('unlimited'),
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={() => dispatch({ type: 'DISMISS_VIOLATION' })}>
              {t('violationDialogAcknowledge')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Recovery Dialog */}
      <AlertDialog
        open={showRecoveryDialog}
        onOpenChange={(open) => !open && dispatch({ type: 'REJECT_RECOVERY' })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <AlertTriangle className="size-6 text-orange-500" />
            </AlertDialogMedia>
            <AlertDialogTitle>{t('recoverPreviousAnswers')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('recoverPreviousAnswersDescription', {
                time: persistence.getRecoverableData()
                  ? new Date(persistence.getRecoverableData()!.lastSaved).toLocaleTimeString()
                  : '',
              })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                persistence.clearSavedAnswers();
                dispatch({ type: 'REJECT_RECOVERY' });
              }}
            >
              {t('startFresh')}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const data = persistence.getRecoverableData();
                if (data) {
                  dispatch({ type: 'ACCEPT_RECOVERY' });
                  toast.success(t('answersRecovered'));
                }
              }}
            >
              {t('recoverAnswers')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Main Layout with Sidebar */}
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
        {/* Main Content */}
        <div className="space-y-6">
          {/* Question Card */}
          <Card
            role="group"
            aria-labelledby={`question-title-${currentQuestion?.id}`}
          >
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span id={`question-title-${currentQuestion?.id}`}>
                  {t('questionNumber', { number: currentIndex + 1 })}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-sm font-normal">
                    {t('points', { count: currentQuestion?.points ?? 0 })}
                  </span>
                </div>
              </CardTitle>
              <CardDescription className="text-foreground mt-4 text-xl leading-relaxed">
                {currentQuestion?.question_text}
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-6">{currentQuestion && renderQuestion(currentQuestion)}</CardContent>
          </Card>

          {/* Navigation */}
          <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
            <Button
              variant="outline"
              onClick={() => dispatch({ type: 'NAVIGATE_TO_QUESTION', index: Math.max(0, currentIndex - 1) })}
              disabled={currentIndex === 0}
              className="w-full md:w-auto"
            >
              {t('previous')}
            </Button>

            <div className="text-sm text-gray-600">
              {t('answeredCount', { answered: answeredCount, total: orderedQuestions.length })}
            </div>

            {currentIndex < orderedQuestions.length - 1 ? (
              <Button
                onClick={() => dispatch({ type: 'NAVIGATE_TO_QUESTION', index: currentIndex + 1 })}
                className="w-full md:w-auto"
              >
                {t('next')}
              </Button>
            ) : (
              <Button
                onClick={() => {
                  const unansweredQuestions = orderedQuestions
                    .map((q, idx) => (!answers[q.id] ? idx + 1 : null))
                    .filter((n): n is number => n !== null);
                  dispatch({ type: 'SHOW_SUBMIT_CONFIRMATION', unansweredQuestions });
                }}
                disabled={isSubmitting}
                className="w-full bg-green-600 hover:bg-green-700 md:w-auto"
              >
                <CheckCircle2 className="mr-2 h-4 w-4" />
                {t('reviewAndSubmit')}
              </Button>
            )}
          </div>
        </div>

        {/* Question Navigation Sidebar */}
        <div className="order-first lg:order-last">
          <Card className="sticky top-6">
            <CardHeader>
              <CardTitle className="text-base">{t('questions')}</CardTitle>
              <CardDescription className="text-xs">{t('questionNavigatorDescription')}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-5 gap-2 md:grid-cols-8 lg:grid-cols-5">
                {orderedQuestions.map((question, index) => {
                  const answered = isAnswered(question.id);
                  const current = index === currentIndex;

                  let bgColor = 'bg-muted hover:bg-gray-200';
                  let textColor = 'text-gray-600';

                  if (current) {
                    bgColor = 'bg-blue-500 hover:bg-blue-600';
                    textColor = 'text-white';
                  } else if (answered) {
                    bgColor = 'bg-green-100 hover:bg-green-200';
                    textColor = 'text-green-700';
                  }

                  return (
                    <button
                      key={question.id}
                      onClick={() => dispatch({ type: 'NAVIGATE_TO_QUESTION', index })}
                      className={`relative flex h-10 w-10 items-center justify-center rounded-lg text-sm font-medium transition-colors ${bgColor} ${textColor}`}
                      aria-label={t('questionAriaLabel', {
                        number: index + 1,
                        answered: answered ? 'true' : 'false',
                      })}
                    >
                      {index + 1}
                    </button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="mt-4 space-y-2 border-t pt-4 text-xs">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded bg-green-100" />
                  <span className="text-gray-600">{t('answered')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 rounded bg-blue-500" />
                  <span className="text-gray-600">{t('current')}</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="bg-muted h-4 w-4 rounded" />
                  <span className="text-gray-600">{t('unanswered')}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <div className="bg-card fixed right-0 bottom-0 left-0 z-50 border-t lg:hidden">
        <div className="px-4 py-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => dispatch({ type: 'NAVIGATE_TO_QUESTION', index: Math.max(0, currentIndex - 1) })}
              disabled={currentIndex === 0}
              className="flex-1"
            >
              {t('previous')}
            </Button>

            {currentIndex < orderedQuestions.length - 1 ? (
              <Button
                size="sm"
                onClick={() => dispatch({ type: 'NAVIGATE_TO_QUESTION', index: currentIndex + 1 })}
                className="flex-1"
              >
                {t('next')}
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => {
                  const unansweredQuestions = orderedQuestions
                    .map((q, idx) => (!isAnswered(q.id) ? idx + 1 : null))
                    .filter((n): n is number => n !== null);
                  dispatch({ type: 'SHOW_SUBMIT_CONFIRMATION', unansweredQuestions });
                }}
                className="flex-1 bg-green-600 hover:bg-green-700"
                disabled={isSubmitting}
              >
                {t('reviewAndSubmit')}
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog
        open={showConfirmation}
        onOpenChange={(open) => !open && dispatch({ type: 'CANCEL_SUBMIT' })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogMedia>
              <CheckCircle2 className="size-6 text-green-600" />
            </AlertDialogMedia>
            <AlertDialogTitle>{t('confirmSubmission')}</AlertDialogTitle>
            <AlertDialogDescription>{t('confirmSubmissionMessage')}</AlertDialogDescription>

            <div className="space-y-3">
              <div className="bg-muted rounded-lg border p-4">
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t('totalQuestions')}:</span>
                    <span className="font-semibold">{orderedQuestions.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-green-600">{t('answered')}:</span>
                    <span className="font-semibold text-green-600">{answeredCount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">{t('unanswered')}:</span>
                    <span className="font-semibold">{orderedQuestions.length - answeredCount}</span>
                  </div>
                </div>
              </div>
              {answeredCount < orderedQuestions.length && (
                <p className="text-sm text-orange-600">
                  ⚠️{' '}
                  {t('unansweredQuestionsWarning', {
                    count: orderedQuestions.length - answeredCount,
                  })}
                </p>
              )}
            </div>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isSubmitting}>{t('reviewQuestions')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleSubmit(false)}
              disabled={isSubmitting}
              className="bg-green-600 hover:bg-green-700"
            >
              {isSubmitting ? t('submitting') : t('confirmAndSubmit')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
