'use client'

import { useCallback, useEffect, useState } from 'react'
import { ClipboardList, LoaderCircle, LockKeyhole } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslations } from 'next-intl'

import { useAssessmentAttempt } from '@/features/assessments/hooks/useAssessment'
import { disabledReasonOf } from '@/features/assessments/domain/disabled-reason'
import { useActivityLayout } from '@/features/assessments/shell/ActivityLayoutContext'
import { useContributorStatus } from '@/hooks/useContributorStatus'
import AssessmentLayout from '@/features/assessments/shell/AssessmentLayout'
import AttemptEntryCard from '@/features/assessments/shell/AttemptEntryCard'
import AttemptResultCard from '@/features/assessments/shell/AttemptResultCard'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { ErrorState } from '@/components/ui/error-state'
import Link from '@components/ui/AppLink'
import { apiJson } from '@/lib/api-client'
import { hasErrorCode, isApiError } from '@/lib/api/assertSuccess'
import { useSession } from '@/hooks/useSession'
import { Actions, Resources, Scopes } from '@/types/permissions'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { useApiError } from '@/hooks/useApiError'
import { learnerCourseStateQueryOptions } from '@/features/learner-course/api'

// ── Types ─────────────────────────────────────────────────────────────────────

interface InlineAssessmentWorkspaceProps {
  activityUuid: string
  courseUuid: string
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * InlineAssessmentWorkspace
 *
 * Renders the correct surface for the student's current attempt state without
 * leaving the activity page URL:
 *
 *  - PREFLIGHT (entry card): recommendedAction ∈ {start, startRevision, blocked, waitForRelease, noAction}
 *  - ACTIVE_ATTEMPT (full-width shell): recommendedAction ∈ {continueDraft, submit}
 *  - RESULT (result card): recommendedAction ∈ {viewResult}
 *
 * Layout mode and the BottomActionBar primary CTA are both registered via
 * ActivityLayoutContext so the parent shell can react without prop-drilling.
 */
export default function InlineAssessmentWorkspace({ activityUuid, courseUuid }: InlineAssessmentWorkspaceProps) {
  const { vm: assessmentData, isLoading, error: assessmentError } = useAssessmentAttempt(activityUuid)
  const { contributorStatus } = useContributorStatus(courseUuid)
  const isTeacher = contributorStatus === 'ACTIVE'
  const { setMode, setBottomBarAction } = useActivityLayout()
  const queryClient = useQueryClient()
  const router = useRouter()
  const t = useTranslations('Features.ActivityWorkspace')
  const tCommon = useTranslations('Common')
  const { handleApiError, toastApiError } = useApiError()
  const [isPending, setIsPending] = useState(false)
  const { can } = useSession()
  const canEditCourse =
    can(Resources.COURSE, Actions.UPDATE, Scopes.OWN) || can(Resources.COURSE, Actions.UPDATE, Scopes.APP)
  // A published activity whose assessment was never created: the contract
  // answers 404, which is "not set up yet", not a failure.
  const isNotConfigured = hasErrorCode(assessmentError, 'not-found')

  // Completion is the projection's call (learner-state), the same source the
  // outline sidebar ticks from — the latest attempt alone can disagree with it
  // (best submitted score decides `passed`).
  const learnerState = useQuery(learnerCourseStateQueryOptions(courseUuid))
  const activityState = learnerState.data?.outline
    .flatMap(chapter => chapter.activities)
    .find(activity => activity.id === activityUuid)

  const vm = assessmentData?.surface === 'ATTEMPT' ? assessmentData.vm : null
  const recommendedAction = vm?.recommendedAction ?? 'noAction'

  const isPreflightMode =
    recommendedAction === 'start' ||
    recommendedAction === 'startRevision' ||
    recommendedAction === 'blocked' ||
    recommendedAction === 'waitForRelease' ||
    recommendedAction === 'noAction'

  const canAct =
    (recommendedAction === 'start' || recommendedAction === 'startRevision') && (vm?.items?.length ?? 0) > 0
  // UX-097: the last hand-in still awaits the teacher — the bar says so; the
  // retake is the entry card's secondary «Начать новую попытку».
  const awaitingRelease =
    recommendedAction === 'start' && (vm?.releaseState === 'AWAITING_RELEASE' || vm?.submissionStatus === 'PENDING')

  // ── Derive layout mode ──────────────────────────────────────────────────────

  useEffect(() => {
    const isActive = recommendedAction === 'continueDraft' || recommendedAction === 'submit'
    setMode(isActive ? 'ACTIVE_ATTEMPT' : recommendedAction === 'viewResult' ? 'RESULT' : 'PREFLIGHT')

    return () => {
      setMode('CONTENT')
    }
  }, [recommendedAction, setMode])

  const startAttempt = useCallback(async () => {
    if (!vm?.assessmentUuid) return
    setIsPending(true)
    try {
      await apiJson(`assessments/${vm.assessmentUuid}/submissions`, {
        method: 'POST',
      })
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.assessments.activity(activityUuid),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.assessments.detail(vm.assessmentUuid),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.assessments.draft(vm.assessmentUuid),
        }),
        // The attempt view is driven by these two; without them the page
        // stayed on the overview until a full reload.
        queryClient.invalidateQueries({
          queryKey: queryKeys.assessments.attemptState(vm.assessmentUuid),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.assessments.mySubmissions(vm.assessmentUuid),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.studentActivity.runtime(
            courseUuid.replace(/^course_/, ''),
            activityUuid.replace(/^activity_/, ''),
          ),
        }),
      ])
      setMode('ACTIVE_ATTEMPT')
      router.refresh()
    } catch (error) {
      const gated = disabledReasonOf(error)
      if (gated || (isApiError(error) && error.status === 403)) {
        // BUG-158: the server's attempt-state moved under us (a gate was
        // assigned, the last attempt was spent) — show it, don't toast «no permission».
        // UX-153: any other 403 (the teacher restricted access) refetches too,
        // so the page follows the server instead of keeping «Start».
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: queryKeys.assessments.attemptState(vm.assessmentUuid) }),
          queryClient.invalidateQueries({ queryKey: queryKeys.assessments.mySubmissions(vm.assessmentUuid) }),
          queryClient.invalidateQueries({ queryKey: ['remediation-sessions'] }),
        ])
        if (gated) return
      }
      toastApiError(error, { fallback: t('startActivityFailed') })
    } finally {
      setIsPending(false)
    }
  }, [activityUuid, courseUuid, queryClient, router, setMode, t, toastApiError, vm])

  // ── Register BottomActionBar CTA for PREFLIGHT ──────────────────────────────

  useEffect(() => {
    if (isNotConfigured) {
      // Replace the runtime's «Start» with an inert, explained control.
      setBottomBarAction({ label: t('notConfiguredTitle'), handler: () => undefined, disabled: true })
      return () => {
        setBottomBarAction(null)
      }
    }

    if (!isPreflightMode || !vm) {
      setBottomBarAction(null)
      return
    }

    if (!canAct) {
      // Blocked or waiting — no actionable CTA
      setBottomBarAction(null)
      return
    }

    if (awaitingRelease) {
      setBottomBarAction({ label: t('pendingGrade'), handler: () => undefined, disabled: true })
      return () => {
        setBottomBarAction(null)
      }
    }

    const label = recommendedAction === 'startRevision' ? t('startRevision') : t('startAssessment')

    setBottomBarAction({ label, handler: startAttempt, isPending })

    return () => {
      setBottomBarAction(null)
    }
  }, [
    isNotConfigured,
    isPreflightMode,
    canAct,
    awaitingRelease,
    recommendedAction,
    vm,
    isPending,
    setBottomBarAction,
    startAttempt,
    t,
  ])

  // ── Loading ─────────────────────────────────────────────────────────────────

  if (isNotConfigured) {
    return (
      <Empty className="min-h-52 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ClipboardList />
          </EmptyMedia>
          <EmptyTitle>{t('notConfiguredTitle')}</EmptyTitle>
          <EmptyDescription>{t('notConfiguredDescription')}</EmptyDescription>
        </EmptyHeader>
        {canEditCourse ? (
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <Link href={`/dash/courses/${courseUuid.replace(/^course_/, '')}/activity/${activityUuid}/studio`} />
            }
          >
            {t('openStudio')}
          </Button>
        ) : null}
      </Empty>
    )
  }

  if (assessmentError) {
    const processed = handleApiError(assessmentError, { fallback: t('startActivityFailed') })
    return (
      <ErrorState
        actionLabel={processed.actionLabel}
        description={processed.message}
        error={assessmentError}
        {...(processed.showRetry ? { onAction: () => router.refresh() } : {})}
        title={t('startActivityFailed')}
        variant="section"
      />
    )
  }

  if (isLoading || !vm) {
    return (
      <div
        className="text-muted-foreground flex min-h-[28rem] flex-col items-center justify-center gap-3 text-sm"
        role="status"
        aria-live="polite"
      >
        <LoaderCircle className="size-6 animate-spin" aria-hidden="true" />
        <span>{tCommon('loading')}</span>
      </div>
    )
  }

  // ── Routing the student to the correct surface ──────────────────────────────

  // UX-213: off the access list — the learner's own attempts, read-only.
  const accessNotice = vm.accessClosed ? (
    <Alert className="mb-4">
      <LockKeyhole aria-hidden="true" />
      <AlertTitle>{t('accessClosedTitle')}</AlertTitle>
      <AlertDescription>{t('accessClosedDescription')}</AlertDescription>
    </Alert>
  ) : null

  // Off the list with nothing handed in: no «ready to start» promise, only the notice.
  if (isPreflightMode && vm.accessClosed && recommendedAction !== 'waitForRelease' && !awaitingRelease) {
    return accessNotice
  }

  // Entry card (pre-flight) — no CTA inside, it lives in BottomActionBar
  if (isPreflightMode) {
    return (
      <>
        {accessNotice}
        <AttemptEntryCard
          vm={vm}
          isTeacher={isTeacher}
          {...(awaitingRelease && canAct
            ? {
                onStartNewAttempt: () => {
                  void startAttempt()
                },
                startPending: isPending,
              }
            : {})}
        />
      </>
    )
  }

  // Result card (post-submit)
  if (recommendedAction === 'viewResult') {
    return (
      <>
        {accessNotice}
        <AttemptResultCard
          vm={vm}
          activityState={activityState}
          onRetry={() => {
            void startAttempt()
          }}
          onStartRevision={() => {
            setMode('ACTIVE_ATTEMPT')
            void queryClient.invalidateQueries({
              queryKey: queryKeys.assessments.activity(activityUuid),
            })
          }}
          onNext={() => {
            router.refresh()
          }}
        />
      </>
    )
  }

  // Active attempt — full-width AssessmentLayout takeover
  return <AssessmentLayout activityUuid={activityUuid} courseUuid={courseUuid} vm={vm} />
}
