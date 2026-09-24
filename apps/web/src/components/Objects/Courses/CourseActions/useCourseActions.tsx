'use client'

/**
 * The course landing's learner CTA and contributor control, shared by the
 * desktop sidebar (`CoursesActions`) and the phone card (`CourseActionsMobile`)
 * so both offer the same branches and toasts (UX-174..176).
 */
import { ArrowRight, CheckCircle2, Clock, Loader2, UserPen } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { toast } from 'sonner'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { useSession } from '@/hooks/useSession'
import { useContributorStatus } from '@/hooks/useContributorStatus'
import { useContributorMutations } from '@/features/courses/hooks/useContributors'
import { useApiError } from '@/hooks/useApiError'
import { hasErrorCode } from '@/lib/api/assertSuccess'
import { apiJson } from '@/lib/api-client'
import { revalidateTags } from '@/lib/cache/revalidate'
import { getAbsoluteUrl } from '@services/config/config'
import { Button } from '@/components/ui/button'
import { learnerCourseProgress, learnerCourseStateQueryOptions } from '@/features/learner-course/api'
import type { LearnerCourseState } from '@/features/learner-course/api'
import { buildLoginRedirect } from '@/lib/auth/redirect'
import { buildCourseWorkspacePath } from '@/lib/course-management'
import Link from '@components/ui/AppLink'

export type CourseCta = 'start' | 'continue' | 'certificate' | 'review' | 'preview'

/** `Courses.CoursesActions` label per CTA — one wording on desktop and phone (UX-174). */
export const CTA_LABEL = {
  start: 'startCourse',
  continue: 'continueLearning',
  certificate: 'viewCertificate',
  review: 'reviewCompletion',
  preview: 'openCourse',
} as const satisfies Record<CourseCta, string>

interface CourseCtaInput {
  courseuuid: string
  course: AppCourse
  trailData?: AppTrailData | null | undefined
  learnerState?: LearnerCourseState | null | undefined
}

export function useCourseCta({ courseuuid, course, trailData, learnerState }: CourseCtaInput) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const { user: currentUser } = useSession()
  const { toastApiError } = useApiError()
  const t = useTranslations('Courses.CoursesActions')
  const [isActionLoading, setIsActionLoading] = useState(false)
  const [isProgressOpen, setIsProgressOpen] = useState(false)

  const cleanCourseUuid = course.course_uuid?.replace('course_', '')
  const hasTrailRun = Boolean(
    trailData?.runs?.find((run: AppTrailRun) => run.course?.course_uuid?.replace('course_', '') === cleanCourseUuid),
  )
  // The wire decides: `learner-state.enrolled` also counts a learner who left
  // but keeps submissions (leaving only resets lesson completions), so the
  // landing must not offer «Начать курс» to someone the server calls enrolled.
  const isStarted = learnerState?.enrolled ?? hasTrailRun
  const { completedIds, total } = learnerCourseProgress(learnerState)
  const activities = course.chapters?.flatMap(chapter => chapter.activities ?? []) ?? []
  const nextUnfinished = activities.find(a => !completedIds.has(a.activity_uuid.replace('activity_', '')))
  const certificateHref =
    learnerState?.certificate?.issued && learnerState.certificate.href
      ? getAbsoluteUrl(learnerState.certificate.href)
      : null
  // 100 % without a certificate: the wire's next action is a review, not «Продолжить» (UX-053).
  const isReviewCompletion = isStarted && !nextUnfinished && learnerState?.next_action?.id === 'review_completion'
  // UX-119: nothing published for learners (0/0) — no CTA to dead-click.
  const hasNoLiveActivities = learnerState !== null && learnerState !== undefined && total === 0
  // BUG-287: the course's staff preview it — the server refuses to enrol them.
  const isStaffPreview = learnerState?.permissions.denial_reason === 'staff_preview'
  const action: CourseCta = isStaffPreview
    ? 'preview'
    : !isStarted
      ? 'start'
      : !nextUnfinished && certificateHref
        ? 'certificate'
        : isReviewCompletion
          ? 'review'
          : 'continue'

  // UX-119: Back within the learner-state staleTime must show the enrolled landing.
  const refreshEnrolment = () =>
    Promise.all([
      revalidateTags(['courses']),
      queryClient.invalidateQueries({ queryKey: queryKeys.trail.current() }),
      queryClient.invalidateQueries({ queryKey: learnerCourseStateQueryOptions(courseuuid).queryKey }),
    ])
  // Client-side `apiJson` so a problem+json code reaches `toastApiError` (BUG-035).
  const enrol = () => apiJson(`trail/courses/${courseuuid}`, { method: 'POST' })
  const openActivity = (activity: AppActivity | undefined) => {
    if (activity?.activity_uuid) {
      router.push(
        `${getAbsoluteUrl('')}/course/${courseuuid}/activity/${activity.activity_uuid.replace('activity_', '')}`,
      )
    } else {
      router.refresh()
    }
  }

  const handleCourseAction = async () => {
    if (!currentUser) {
      router.push(buildLoginRedirect(`/course/${courseuuid}`))
      return
    }
    // A completed course with a certificate leads to the certificate, not back into the course.
    if (action === 'certificate' && certificateHref) {
      router.push(certificateHref)
      return
    }
    if (action === 'review') {
      setIsProgressOpen(true)
      return
    }
    if (action === 'preview') {
      openActivity(activities[0])
      return
    }

    setIsActionLoading(true)
    // Enrolled on the wire but no trail run (left with submissions): bring the
    // run back so `/trail` lists the course again — quietly, it is not a new start.
    const loadingToast = action === 'start' ? toast.loading(t('startingCourse')) : undefined
    try {
      if (action === 'start' || !hasTrailRun) {
        await enrol()
        await refreshEnrolment()
      }
      if (loadingToast !== undefined) toast.success(t('startedCourseSuccess'), { id: loadingToast })
      // Continue: first unfinished activity (all done → the first one).
      openActivity(action === 'start' ? activities[0] : (nextUnfinished ?? activities[0]))
    } catch (error) {
      toastApiError(error, loadingToast === undefined ? {} : { toastId: loadingToast }, t('startCourseError'))
    } finally {
      setIsActionLoading(false)
    }
  }

  return {
    action,
    isStarted,
    hasNoLiveActivities,
    isActionLoading,
    handleCourseAction,
    isProgressOpen,
    setIsProgressOpen,
  }
}

/** Apply / pending + withdraw / active link for a course open to contributors. */
export function ContributorControl({ courseuuid, course }: { courseuuid: string; course: AppCourse }) {
  const router = useRouter()
  const { user: currentUser } = useSession()
  const { contributorStatus, contributorRole, refetch } = useContributorStatus(courseuuid)
  const { apply, remove, busyUserId } = useContributorMutations(courseuuid)
  const { toastApiError } = useApiError()
  const t = useTranslations('Courses.CoursesActions')
  const [isContributeLoading, setIsContributeLoading] = useState(false)
  const loginHref = buildLoginRedirect(`/course/${courseuuid}`)

  if (contributorStatus === 'INACTIVE' || contributorRole === 'creator' || course.open_to_contributors !== true) {
    return null
  }

  const handleApply = async () => {
    setIsContributeLoading(true)
    const loadingToast = toast.loading(t('submittingContributorApplication'))
    try {
      await apply()
      await revalidateTags(['courses'])
      await refetch()
      toast.success(t('contributorApplicationSuccess'), { id: loadingToast })
    } catch (error) {
      // 409 `conflict`: the course closed meanwhile, or a role already exists.
      if (hasErrorCode(error, 'conflict')) toast.error(t('contributorApplicationConflict'), { id: loadingToast })
      else toastApiError(error, { toastId: loadingToast }, t('contributorApplicationError'))
    } finally {
      setIsContributeLoading(false)
    }
  }

  // A pending applicant may withdraw (`DELETE contributors/{self}` → 204).
  const handleWithdraw = async () => {
    if (!currentUser) return
    const loadingToast = toast.loading(t('withdrawingApplication'))
    try {
      await remove(currentUser.id)
      await refetch()
      toast.success(t('applicationWithdrawn'), { id: loadingToast })
    } catch (error) {
      // Stale page: the application was decided (403) or withdrawn elsewhere (404) — refetch and say so (UX-050).
      if (hasErrorCode(error, 'forbidden') || hasErrorCode(error, 'not-found')) {
        await refetch()
        toast.info(t('applicationAlreadyReviewed'), { id: loadingToast })
        return
      }
      toastApiError(error, { toastId: loadingToast }, t('withdrawApplicationError'))
    }
  }

  if (!currentUser) {
    return (
      <Button
        variant="outline"
        onClick={() => router.push(loginHref)}
        aria-label={t('aria.signupToApply')}
        className="h-12 w-full gap-2 text-base"
      >
        <UserPen className="size-5" />
        {t('authenticateToContribute')}
      </Button>
    )
  }

  if (contributorStatus === 'ACTIVE') {
    return (
      <Link
        href={buildCourseWorkspacePath(courseuuid, 'overview')}
        className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-emerald-200/60 bg-gradient-to-r from-emerald-500/5 to-teal-500/5 px-4 text-sm font-medium text-emerald-800 shadow-xs hover:underline dark:border-emerald-500/25 dark:from-emerald-500/10 dark:to-teal-500/5 dark:text-emerald-400 dark:shadow-sm dark:shadow-emerald-950/20"
      >
        <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
        {t('youAreAContributor')}
        <ArrowRight className="size-4" />
      </Link>
    )
  }

  if (contributorStatus === 'PENDING') {
    const isWithdrawing = busyUserId === currentUser.id
    return (
      <div className="space-y-2">
        <div className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-amber-200/60 bg-gradient-to-r from-amber-500/5 to-yellow-500/5 px-4 text-sm font-medium text-amber-800 shadow-xs dark:border-amber-500/25 dark:from-amber-500/10 dark:to-yellow-500/5 dark:text-amber-400 dark:shadow-sm dark:shadow-amber-950/20">
          <Clock className="size-4 text-amber-600 dark:text-amber-400" />
          {t('contributorApplicationPending')}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleWithdraw}
          disabled={isWithdrawing}
          className="text-muted-foreground w-full"
        >
          {isWithdrawing ? <Loader2 className="size-4 animate-spin" /> : t('withdrawApplication')}
        </Button>
      </div>
    )
  }

  return (
    <Button
      variant="outline"
      onClick={handleApply}
      disabled={isContributeLoading}
      aria-label={t('aria.applyToBecome')}
      className="h-12 w-full gap-2 text-base"
    >
      {isContributeLoading ? (
        <Loader2 className="size-5 animate-spin" />
      ) : (
        <>
          <UserPen className="size-5" />
          {t('applyToContribute')}
        </>
      )}
    </Button>
  )
}
