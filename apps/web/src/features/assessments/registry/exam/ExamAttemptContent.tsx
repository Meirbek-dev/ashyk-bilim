'use client'

import { LayoutList, MessageSquareText, RotateCcw, Rows2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { queryOptions, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocale, useTranslations } from 'next-intl'
import { DATE_TIME_LONG_OPTIONS, formatDate } from '@/lib/date'
import { toast } from 'sonner'

import { reportSubmissionViolation } from '@/features/assessments/submission-client'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { courseKeys } from '@/hooks/courses/courseKeys'
import { DEFAULT_POLICY_VIEW } from '@/features/assessments/domain/policy'
import { submitVerdict } from '@/features/assessments/domain/grade-of-record'
import { learnerCourseStateQueryOptions } from '@/features/learner-course/api'
import { isAnswered as isItemAnswered } from '@/features/assessments/domain/items'
import type { AssessmentItem, ItemAnswer } from '@/features/assessments/domain/items'
import { extractMarkdownSummary, MarkdownContent } from '@/features/content-markdown'
import { usePercentFormat } from '@/features/assessments/shared/usePercentFormat'
import { useAttemptShellControls } from '@/features/assessments/shell'
import type { AttemptShellRegistration } from '@/features/assessments/shell/AssessmentActionBar'
import { useAssessmentAttempt } from '@/features/assessments/shell/hooks/useAssessmentAttempt'
import { useAssessmentSubmission } from '@/features/assessments/hooks/useAssessmentSubmission'
import PageLoading from '@components/Objects/Loaders/PageLoading'
import ExamQuestionNavigation, { ExamQuestionNavigationMobile } from './ExamQuestionNavigation'
import { Progress } from '@components/ui/progress'
import type { KindAttemptProps } from '../index'
import ExamQuestionCard from './ExamQuestionCard'
import ExamSubmitDialog from './ExamSubmitDialog'

export default function ExamAttemptContent({ courseUuid, vm }: KindAttemptProps) {
  const t = useTranslations('Activities.ExamActivity')
  const queryClient = useQueryClient()
  const submissionState = useAssessmentSubmission(vm?.assessmentUuid ?? null)
  // Keeps the learner projection loaded: the submit toast reads the counted result from its cache.
  useQuery(learnerCourseStateQueryOptions(courseUuid))
  const policy = vm?.policy ?? DEFAULT_POLICY_VIEW
  const assessmentUuid = vm?.assessmentUuid ?? null
  // Every item the server returns is a question - no kind filter (BUG-110).
  const questions = vm?.items ?? []

  const handleComplete = useCallback(async () => {
    await Promise.allSettled([
      queryClient.invalidateQueries({ queryKey: queryKeys.trail.current() }),
      queryClient.invalidateQueries({
        queryKey: courseKeys.structure(courseUuid, false),
      }),
    ])

    if (!assessmentUuid) return

    await Promise.allSettled([
      queryClient.invalidateQueries({
        queryKey: queryKeys.assessments.draft(assessmentUuid),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.assessments.attemptState(assessmentUuid),
      }),
      queryClient.invalidateQueries(
        queryOptions({
          queryKey: queryKeys.assessments.mySubmissions(assessmentUuid),
        }),
      ),
      queryClient.invalidateQueries({
        queryKey: queryKeys.assessments.detail(assessmentUuid),
      }),
    ])
  }, [assessmentUuid, courseUuid, queryClient])

  // UX-224: the counted result (projection) - the submit refreshes it before
  // resolving, so the toast reads what the result card will show.
  const activityUuid = vm?.activityUuid
  const countedActivity = useCallback(
    () =>
      queryClient
        .getQueryData(learnerCourseStateQueryOptions(courseUuid).queryKey)
        ?.outline.flatMap(chapter => chapter.activities)
        .find(activity => activity.id === activityUuid),
    [activityUuid, courseUuid, queryClient],
  )

  if (!assessmentUuid && vm) {
    return <div className="text-destructive rounded-lg border p-6 text-sm">{t('errorLoadingExam')}</div>
  }

  // The entry and result screens belong to InlineAssessmentWorkspace; this
  // shell only renders while a draft is open. Between a submit and the
  // attempt-state refetch there is no draft - a loader, not a second «Start».
  if (!vm || submissionState.isLoading || !submissionState.draft) {
    return <PageLoading />
  }

  const latestCompleted = submissionState.submissions.find(submission => submission.status !== 'DRAFT')
  // Mid-attempt only the returned-for-revision feedback matters; an older
  // attempt's score would read as this attempt's result.
  // A returned attempt is never `isResultVisible` (that is a `visible` release), so read its own comment.
  const revisionFeedback =
    latestCompleted?.status === 'RETURNED' ? latestCompleted.grading?.feedback?.trim() || null : null

  return (
    <ExamTakingContent
      key={submissionState.draft.submission_uuid}
      title={vm.title}
      questions={questions}
      submissionState={submissionState}
      attempt={submissionState.draft}
      policy={policy}
      onComplete={handleComplete}
      countedActivity={countedActivity}
      canSaveDraft={vm.canSaveDraft}
      canSubmit={vm.canSubmit}
      timerExpiresAt={vm.timerExpiresAt}
      passingScore={vm.passingScore}
      revisionFeedback={revisionFeedback}
    />
  )
}

function ExamTakingContent({
  title,
  questions,
  submissionState,
  attempt,
  policy,
  onComplete,
  countedActivity,
  canSaveDraft,
  canSubmit,
  timerExpiresAt,
  passingScore,
  revisionFeedback,
}: {
  title: string
  questions: AssessmentItem[]
  submissionState: ReturnType<typeof useAssessmentSubmission>
  attempt: NonNullable<ReturnType<typeof useAssessmentSubmission>['draft']>
  policy: typeof DEFAULT_POLICY_VIEW
  onComplete: () => void | Promise<void>
  countedActivity: () => Parameters<typeof submitVerdict>[1]
  canSaveDraft: boolean
  canSubmit: boolean
  timerExpiresAt: string | null
  passingScore: number | null
  revisionFeedback: string | null
}) {
  const t = useTranslations('Activities.ExamActivity')
  const tWorkspace = useTranslations('Features.ActivityWorkspace')
  const formatPercent = usePercentFormat()
  const locale = useLocale()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isConfirmingSubmit, setIsConfirmingSubmit] = useState(false)
  const [showRecoveryDialog, setShowRecoveryDialog] = useState(false)
  const [recoveredAnswers, setRecoveredAnswers] = useState<Record<string, ItemAnswer> | null>(null)
  // "Draft restored" means answers existed BEFORE this attempt was opened; the
  // draft query refetches after every autosave, so `answered_count` alone would
  // flip the banner on ~2 s into a brand-new attempt.
  const [resumedDraft] = useState(() => attempt.answered_count > 0)
  const [flaggedIndexes, setFlaggedIndexes] = useState<Set<number>>(new Set())
  const violationCountRef = useRef(attempt.violation_count)

  // View mode: CARD (one at a time) or SCROLL (all visible)
  const [viewMode, setViewMode] = useState<'CARD' | 'SCROLL'>(() => {
    try {
      return (globalThis.window?.localStorage?.getItem('exam-view-mode') as 'CARD' | 'SCROLL') ?? 'CARD'
    } catch {
      return 'CARD'
    }
  })
  const questionRefs = useRef<(HTMLDivElement | null)[]>([])

  const toggleViewMode = useCallback(() => {
    setViewMode(prev => {
      const next = prev === 'CARD' ? 'SCROLL' : 'CARD'
      try {
        globalThis.window.localStorage?.setItem('exam-view-mode', next)
      } catch {
        // Storage may be disabled; the in-memory preference still works.
      }
      return next
    })
  }, [])

  // One way to move between questions: every nav control (bar, grid, mobile
  // strip, the submit dialog's unanswered list) lands on it and, in scroll
  // mode, brings the question into view.
  const goTo = useCallback(
    (index: number) => {
      setCurrentIndex(index)
      if (viewMode === 'SCROLL') questionRefs.current[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    },
    [viewMode],
  )

  const validateRecoveredAnswers = useCallback((answers: unknown): boolean => {
    if (!answers || typeof answers !== 'object') return false
    const record = answers as Record<string, unknown>
    for (const key of Object.keys(record)) {
      const ans = record[key]
      if (!ans || typeof ans !== 'object') return false
      const itemAnswer = ans as Record<string, unknown>
      const kind = itemAnswer.kind
      if (typeof kind !== 'string' || !['CHOICE', 'OPEN_TEXT', 'FORM', 'CODE', 'MATCHING'].includes(kind)) {
        return false
      }
      if (kind === 'CHOICE' && !Array.isArray(itemAnswer.selected)) return false
      if (kind === 'OPEN_TEXT' && typeof itemAnswer.text !== 'string') return false
      if (kind === 'FORM' && (!itemAnswer.values || typeof itemAnswer.values !== 'object')) return false
      if (kind === 'CODE' && (typeof itemAnswer.language !== 'number' || typeof itemAnswer.source !== 'string'))
        return false
      if (kind === 'MATCHING' && !Array.isArray(itemAnswer.matches)) return false
    }
    return true
  }, [])

  const handleRestoreAnswers = useCallback(
    (recovered: Record<string, ItemAnswer>) => {
      if (Object.keys(submissionState.answers).length === 0 && Object.keys(recovered).length > 0) {
        setRecoveredAnswers(recovered)
        setShowRecoveryDialog(true)
      }
    },
    [submissionState.answers],
  )

  const persistence = useAssessmentAttempt<Record<string, ItemAnswer>>({
    attemptUuid: attempt.submission_uuid,
    autoSaveInterval: 5000,
    expirationHours: 24,
    storageKeyPrefix: 'exam_answers_',
    validate: validateRecoveredAnswers,
    onRestore: handleRestoreAnswers,
  })

  const orderedQuestions = questions

  // Track which question is in view when in SCROLL mode
  useEffect(() => {
    if (viewMode !== 'SCROLL') return
    const observers: IntersectionObserver[] = []
    orderedQuestions.forEach((_, index) => {
      const ref = questionRefs.current[index]
      if (!ref) return
      const obs = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) setCurrentIndex(index)
        },
        { threshold: 0.4, rootMargin: '-10% 0px -55% 0px' },
      )
      obs.observe(ref)
      observers.push(obs)
    })
    return () => observers.forEach(obs => obs.disconnect())
  }, [viewMode, orderedQuestions])
  const currentQuestion = orderedQuestions[currentIndex]
  const isAnswered = useCallback(
    (questionId: string) => isItemAnswered(submissionState.answers[questionId]),
    [submissionState.answers],
  )

  const answeredCount = orderedQuestions.filter(question => isAnswered(question.id)).length
  const answeredIndexes = useMemo(
    () =>
      orderedQuestions.reduce<Set<number>>((set, question, index) => {
        if (isAnswered(question.id)) set.add(index)
        return set
      }, new Set()),
    [isAnswered, orderedQuestions],
  )

  const progress = orderedQuestions.length > 0 ? (answeredCount / orderedQuestions.length) * 100 : 0

  const handleAnswerChange = (itemId: string, answer: ItemAnswer) => {
    submissionState.setItemAnswer(itemId, answer)
    persistence.saveAnswers({ ...submissionState.answers, [itemId]: answer })
  }

  const handleOpenSubmitConfirmation = useCallback(() => {
    setIsConfirmingSubmit(true)
  }, [])

  const handleSubmit = useCallback(
    async (isAutoSubmit = false) => {
      if (submissionState.isSubmitting) return
      setIsConfirmingSubmit(false)

      try {
        const submitted = await submissionState.submit({
          violationCount: violationCountRef.current,
          autoSubmit: isAutoSubmit,
        })
        persistence.clearSavedAnswers()
        // The toast states the verdict, never «успешно завершен» over «Не пройдено» (UX-035),
        // and the counted result the card shows, not this attempt's (UX-224).
        const verdict = submitVerdict(
          submitted.release_state === 'visible' ? submitted.final_score : null,
          countedActivity(),
          passingScore,
        )
        // A failed verdict is no success: no green check over «Тест не пройден».
        const notify = verdict?.passed === false ? toast.warning : toast.success
        notify(
          verdict
            ? [
                t(verdict.passed ? 'examSubmittedPassed' : 'examSubmittedFailed', {
                  score: formatPercent(verdict.score),
                }),
                verdict.latest === null
                  ? null
                  : tWorkspace('latestAttemptScore', { score: formatPercent(verdict.latest) }),
              ]
                .filter(Boolean)
                .join(' · ')
            : submitted.status === 'PENDING'
              ? t('examSubmittedPending')
              : t('examSubmittedSuccessfully'),
        )
        await onComplete()
      } catch {
        // The submission hook has already toasted the localized reason.
      }
    },
    [countedActivity, formatPercent, onComplete, passingScore, persistence, submissionState, t, tWorkspace],
  )

  const handleViolation = useCallback(
    async (type: string, count: number) => {
      violationCountRef.current = count
      // The server keeps the authoritative count and audit trail
      // (`POST submissions/{id}/violations`); the local tally only ever
      // raises what is sent with the final submit.
      try {
        const state = await reportSubmissionViolation(attempt.id, type.toLowerCase())
        violationCountRef.current = Math.max(violationCountRef.current, state.violation_count)
      } catch {
        // Reporting is best-effort; the guard's local threshold still applies.
      }
    },
    [attempt.id],
  )

  const toggleFlag = useCallback((index: number) => {
    setFlaggedIndexes(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }, [])

  useEffect(() => {
    if (!canSaveDraft || submissionState.status !== 'DRAFT' || submissionState.saveState !== 'dirty') return
    const timeout = setTimeout(() => {
      submissionState.save()
    }, 1000)
    return () => clearTimeout(timeout)
  }, [submissionState, canSaveDraft])

  const shellControls = useMemo<AttemptShellRegistration>(
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
      // Answers autosave (the badge says so); no manual «Save» button.
      canSubmit,
      isSaving: submissionState.isSaving,
      isSubmitting: submissionState.isSubmitting,
      ...(canSubmit ? { onSubmit: handleOpenSubmitConfirmation } : {}),
      navigation: {
        current: currentIndex + 1,
        total: orderedQuestions.length,
        answered: answeredCount,
        canPrevious: currentIndex > 0,
        canNext: currentIndex < orderedQuestions.length - 1,
        onPrevious: () => goTo(Math.max(0, currentIndex - 1)),
        onNext: () => goTo(Math.min(orderedQuestions.length - 1, currentIndex + 1)),
      },
      timer: policy.timeLimitSeconds
        ? {
            startedAt: attempt.started_at ?? attempt.created_at,
            timeLimitMinutes: Math.max(1, Math.ceil(policy.timeLimitSeconds / 60)),
            expiresAt: timerExpiresAt,
            onExpire: () => {
              toast.error(
                t('autoSubmitting', {
                  reason: t('autoSubmittingReason.timeExpired'),
                }),
              )
              void handleSubmit(true)
            },
          }
        : null,
      policy,
      initialViolationCount: attempt.violation_count,
      onViolation: handleViolation,
      // UX-087: the guard already told the learner the attempt is forfeited.
      onGuardAutoSubmit: () => {
        void handleSubmit(true)
      },
      recovery: showRecoveryDialog
        ? {
            open: true,
            lastSavedAt: persistence.getRecoverableData()?.lastSaved ?? null,
            onAccept: () => {
              if (recoveredAnswers) {
                for (const [itemUuid, answer] of Object.entries(recoveredAnswers)) {
                  submissionState.setItemAnswer(itemUuid, answer)
                }
              }
              setShowRecoveryDialog(false)
              toast.success(t('answersRecovered'))
            },
            onReject: () => {
              persistence.clearSavedAnswers()
              setShowRecoveryDialog(false)
              setRecoveredAnswers(null)
            },
          }
        : null,
      conflict: submissionState.conflict
        ? {
            open: true,
            latestVersion: submissionState.conflict.latestVersion ?? 0,
            latestSavedAt: submissionState.conflict.latestSavedAt,
            localAnswerCount: submissionState.conflict.localAnswerCount,
            serverAnswerCount: submissionState.conflict.serverAnswerCount,
            onKeepLocalVersion: submissionState.conflict.onKeepLocalVersion,
            onUseServerVersion: submissionState.conflict.onUseServerVersion,
          }
        : null,
    }),
    [
      canSubmit,
      answeredCount,
      attempt.created_at,
      attempt.violation_count,
      attempt.started_at,
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
      timerExpiresAt,
      goTo,
    ],
  )

  useAttemptShellControls(shellControls)

  if (!currentQuestion) {
    return (
      <div className="text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm">
        {title ? `${title}: ` : ''}
        {t('noQuestions')}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {resumedDraft ? (
        <Alert>
          <RotateCcw className="size-4" />
          <AlertTitle>{t('resumedDraft')}</AlertTitle>
          <AlertDescription>
            {t('resumedDraftDescription', {
              time: formatDate(attempt.updated_at, locale, DATE_TIME_LONG_OPTIONS),
            })}
          </AlertDescription>
        </Alert>
      ) : null}

      {revisionFeedback ? (
        <Alert>
          <MessageSquareText className="size-4" />
          <AlertTitle>{tWorkspace('teacherFeedback')}</AlertTitle>
          <AlertDescription>
            <MarkdownContent content={revisionFeedback} mode="compactRichText" />
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Progress bar + view mode toggle */}
      <div className="flex items-center gap-3">
        <Progress
          value={progress}
          className="h-2 flex-1 transition-all duration-500 ease-out"
          aria-label={t('questionProgress', {
            current: currentIndex + 1,
            total: orderedQuestions.length,
          })}
        />
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 shrink-0"
                onClick={toggleViewMode}
                aria-label={viewMode === 'CARD' ? t('switchToScrollMode') : t('switchToCardMode')}
              >
                {viewMode === 'CARD' ? <LayoutList className="size-4" /> : <Rows2 className="size-4" />}
              </Button>
            }
          />
          <TooltipContent side="left">
            {viewMode === 'CARD' ? t('switchToScrollMode') : t('switchToCardMode')}
          </TooltipContent>
        </Tooltip>
      </div>

      {viewMode === 'CARD' ? (
        /* ── Card mode: one question at a time ─────────────── */
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-6">
            <ExamQuestionCard
              item={currentQuestion}
              questionNumber={currentIndex + 1}
              answer={submissionState.answers[currentQuestion.id]}
              isFlagged={flaggedIndexes.has(currentIndex)}
              onAnswerChange={handleAnswerChange}
              onToggleFlag={() => toggleFlag(currentIndex)}
              disabled={!canSaveDraft}
            />
          </div>

          <div className="order-first hidden lg:order-last lg:block">
            <ExamQuestionNavigation
              totalQuestions={orderedQuestions.length}
              currentQuestionIndex={currentIndex}
              answeredQuestions={answeredIndexes}
              flaggedQuestions={flaggedIndexes}
              onQuestionSelect={goTo}
            />
          </div>
        </div>
      ) : (
        /* ── Scroll mode: all questions visible ─────────────── */
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-6">
            {orderedQuestions.map((question, index) => (
              <div
                key={question.id}
                ref={el => {
                  questionRefs.current[index] = el
                }}
                id={`exam-q-${index}`}
                className={cn(
                  'scroll-mt-4 rounded-lg transition-all duration-300',
                  currentIndex === index && 'ring-2 ring-primary/30',
                )}
              >
                <ExamQuestionCard
                  item={question}
                  questionNumber={index + 1}
                  answer={submissionState.answers[question.id]}
                  isFlagged={flaggedIndexes.has(index)}
                  onAnswerChange={handleAnswerChange}
                  onToggleFlag={() => toggleFlag(index)}
                  disabled={!canSaveDraft}
                />
              </div>
            ))}
          </div>

          <div className="order-first hidden lg:order-last lg:block">
            <div className="sticky top-4">
              <ExamQuestionNavigation
                totalQuestions={orderedQuestions.length}
                currentQuestionIndex={currentIndex}
                answeredQuestions={answeredIndexes}
                flaggedQuestions={flaggedIndexes}
                onQuestionSelect={goTo}
              />
            </div>
          </div>
        </div>
      )}

      <ExamQuestionNavigationMobile
        totalQuestions={orderedQuestions.length}
        currentQuestionIndex={currentIndex}
        answeredQuestions={answeredIndexes}
        flaggedQuestions={flaggedIndexes}
        onQuestionSelect={goTo}
      />

      <ExamSubmitDialog
        open={isConfirmingSubmit}
        totalQuestions={orderedQuestions.length}
        answeredCount={answeredCount}
        flaggedCount={flaggedIndexes.size}
        unansweredQuestions={orderedQuestions
          .map((q, i) => ({ index: i, id: q.id, question_text: extractMarkdownSummary(q.body.prompt, 120) }))
          .filter(q => !isAnswered(q.id))}
        isSubmitting={submissionState.isSubmitting}
        onNavigateTo={index => {
          setIsConfirmingSubmit(false)
          goTo(index)
        }}
        labels={{
          confirmSubmission: t('confirmSubmission'),
          confirmSubmissionMessage: t('confirmSubmissionMessage'),
          totalQuestions: t('totalQuestions'),
          answered: t('answered'),
          unanswered: t('unanswered'),
          reviewQuestions: t('reviewQuestions'),
          submitting: t('submitting'),
          confirmAndSubmit: t('confirmAndSubmit'),
          unansweredQuestions: t('unansweredQuestions'),
          flaggedForReview: t('flaggedForReview'),
        }}
        onCancel={() => setIsConfirmingSubmit(false)}
        onSubmit={() => void handleSubmit()}
      />
    </div>
  )
}
