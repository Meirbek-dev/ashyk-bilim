import { ArrowRight, BookOpen, CheckCircle2, Clock, Loader2, PlayCircle, Trophy, UserPen } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { useSession } from '@/hooks/useSession'
import { useContributorStatus } from '@/hooks/useContributorStatus'
import { useContributorMutations } from '@/features/courses/hooks/useContributors'
import { useApiError } from '@/hooks/useApiError'
import { hasErrorCode } from '@/lib/api/assertSuccess'
import CourseProgress from '../CourseProgress/CourseProgress'
import { revalidateTags } from '@/lib/cache/revalidate'
import { startCourse } from '@services/courses/activity'
import { getAbsoluteUrl } from '@services/config/config'
import { Card, CardContent } from '@/components/ui/card'
import UserAvatar from '@components/Objects/UserAvatar'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { learnerCourseProgress } from '@/features/learner-course/api'
import type { LearnerCourseState } from '@/features/learner-course/api'
import { buildLoginRedirect } from '@/lib/auth/redirect'

interface CourseActionsProps {
  courseuuid: string
  course: AppCourse
  trailData?: AppTrailData | null | undefined
  /** Single progress source (published activities only) — same data as the activity sidebar. */
  learnerState?: LearnerCourseState | null | undefined
}

function CoursesActions({ courseuuid, course, trailData, learnerState }: CourseActionsProps) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const { user: currentUser } = useSession()
  const [isActionLoading, setIsActionLoading] = useState(false)
  const [isContributeLoading, setIsContributeLoading] = useState(false)
  const { contributorStatus, contributorRole, refetch } = useContributorStatus(courseuuid)
  const { apply, remove, busyUserId } = useContributorMutations(courseuuid)
  const { toastApiError } = useApiError()
  const [isProgressOpen, setIsProgressOpen] = useState(false)
  const t = useTranslations('Courses.CoursesActions')

  // Clean up course UUID by removing 'course_' prefix if it exists
  const cleanCourseUuid = course.course_uuid?.replace('course_', '')

  const hasTrailRun = Boolean(
    trailData?.runs?.find((activeRun: AppTrailRun) => {
      const cleanRunCourseUuid = activeRun.course?.course_uuid?.replace('course_', '')
      return cleanRunCourseUuid === cleanCourseUuid
    }),
  )
  // The wire decides: `learner-state.enrolled` also counts a learner who left
  // but keeps submissions (leaving only resets lesson completions), so the
  // landing must not offer «Начать курс» to someone the server calls enrolled.
  const isStarted = learnerState?.enrolled ?? hasTrailRun
  const nextUnfinished = (() => {
    const { completedIds } = learnerCourseProgress(learnerState)
    return course.chapters
      ?.flatMap(chapter => chapter.activities ?? [])
      .find(activity => !completedIds.has(activity.activity_uuid.replace('activity_', '')))
  })()
  const certificateHref =
    learnerState?.certificate?.issued && learnerState.certificate.href
      ? getAbsoluteUrl(learnerState.certificate.href)
      : null

  // Anonymous: sign in and come straight back to this course.
  const loginHref = buildLoginRedirect(`/course/${courseuuid}`)

  const handleCourseAction = async () => {
    if (!currentUser) {
      router.push(loginHref)
      return
    }

    // A completed course with a certificate leads to the certificate, not back into the course.
    if (isStarted && !nextUnfinished && certificateHref) {
      router.push(certificateHref)
      return
    }

    // If already started, navigate to first unfinished activity
    if (isStarted) {
      // Enrolled on the wire but no trail run (left with submissions): bring
      // the run back so `/trail` lists the course again.
      if (!hasTrailRun) {
        await startCourse(`course_${courseuuid}`).catch(() => undefined)
        await queryClient.invalidateQueries({ queryKey: queryKeys.trail.current() })
      }
      const { completedIds } = learnerCourseProgress(learnerState)

      // Find first unfinished activity
      let firstUnfinishedActivity: AppActivity | null = null

      if (course.chapters) {
        for (const chapter of course.chapters) {
          if (chapter.activities) {
            for (const activity of chapter.activities) {
              const isCompleted = completedIds.has(activity.activity_uuid.replace('activity_', ''))
              if (!isCompleted) {
                firstUnfinishedActivity = activity
                break
              }
            }
          }
          if (firstUnfinishedActivity) break
        }
      }

      // If all activities are completed, go to first activity
      const targetActivity = firstUnfinishedActivity || course.chapters?.[0]?.activities?.[0]

      if (targetActivity?.activity_uuid) {
        router.push(
          `${getAbsoluteUrl('')}/course/${courseuuid}/activity/${targetActivity.activity_uuid.replace('activity_', '')}`,
        )
      }
      return
    }

    setIsActionLoading(true)
    const loadingToast = toast.loading(t('startingCourse'))

    try {
      await startCourse(`course_${courseuuid}`)
      await queryClient.invalidateQueries({ queryKey: queryKeys.trail.current() })
      toast.success(t('startedCourseSuccess'), { id: loadingToast })

      // Get the first activity from the first chapter
      const firstChapter = course.chapters?.[0]
      const firstActivity = firstChapter?.activities?.[0]

      if (firstActivity) {
        // Redirect to the first activity
        router.push(
          `${getAbsoluteUrl('')}/course/${courseuuid}/activity/${firstActivity.activity_uuid.replace('activity_', '')}`,
        )
      } else {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.trail.current(),
        })
        router.refresh()
      }
    } catch (error) {
      console.error('Failed to perform course action:', error)
      toast.error(t('startCourseError'), {
        id: loadingToast,
      })
    } finally {
      setIsActionLoading(false)
    }
  }

  const handleApplyToContribute = async () => {
    if (!currentUser) {
      router.push(loginHref)
      return
    }

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
  const handleWithdrawApplication = async () => {
    if (!currentUser) return
    const loadingToast = toast.loading(t('withdrawingApplication'))
    try {
      await remove(currentUser.id)
      await refetch()
      toast.success(t('applicationWithdrawn'), { id: loadingToast })
    } catch (error) {
      toastApiError(error, { toastId: loadingToast }, t('withdrawApplicationError'))
    }
  }

  const renderActionButton = (action: 'start' | 'continue' | 'certificate') => {
    const isAuthenticated = Boolean(currentUser)
    const icon =
      action === 'start' ? (
        <PlayCircle className="size-5" />
      ) : action === 'certificate' ? (
        <CheckCircle2 className="size-5" />
      ) : (
        <ArrowRight className="size-5" />
      )
    const label =
      action === 'start' ? t('startCourse') : action === 'certificate' ? t('viewCertificate') : t('continueLearning')

    return (
      <div className="flex items-center gap-3">
        {isAuthenticated ? (
          <UserAvatar size="xs" variant="outline" use_with_session />
        ) : (
          <UserAvatar size="xs" variant="outline" predefined_avatar="empty" />
        )}
        <span className="flex-1">{label}</span>
        {icon}
      </div>
    )
  }

  const renderContributorButton = () => {
    if (contributorStatus === 'INACTIVE' || contributorRole === 'creator' || course.open_to_contributors !== true) {
      return null
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
        <div className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl border border-emerald-200/60 bg-gradient-to-r from-emerald-500/5 to-teal-500/5 px-4 text-sm font-medium text-emerald-800 shadow-xs dark:border-emerald-500/25 dark:from-emerald-500/10 dark:to-teal-500/5 dark:text-emerald-400 dark:shadow-sm dark:shadow-emerald-950/20">
          <CheckCircle2 className="size-4 text-emerald-600 dark:text-emerald-400" />
          {t('youAreAContributor')}
        </div>
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
            onClick={handleWithdrawApplication}
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
        onClick={handleApplyToContribute}
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

  const renderProgressSection = () => {
    const {
      completed: completedActivities,
      total: totalActivities,
      percent: progressPercentage,
    } = learnerCourseProgress(learnerState)
    const isCompleted = totalActivities > 0 && progressPercentage === 100

    if (!isStarted) {
      return (
        <Button
          type="button"
          onClick={() => setIsProgressOpen(true)}
          variant="ghost"
          className="group border-border/60 bg-muted/20 hover:border-border/80 hover:bg-muted/40 flex h-auto w-full items-center gap-4 rounded-xl border p-4 text-left whitespace-normal transition-all hover:shadow-xs"
        >
          <div className="bg-muted group-hover:bg-muted/80 relative flex size-14 shrink-0 items-center justify-center rounded-full transition-colors">
            <BookOpen className="text-muted-foreground size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-foreground text-sm font-medium">{t('readyToBegin')}</p>
            {totalActivities > 0 && (
              <p className="text-muted-foreground mt-0.5 text-sm">{t('startLearningJourney', { totalActivities })}</p>
            )}
          </div>
          <ArrowRight className="text-primary size-5 transition-transform group-hover:translate-x-0.5" />
        </Button>
      )
    }

    return (
      <Button
        type="button"
        onClick={() => setIsProgressOpen(true)}
        variant="ghost"
        className={cn(
          'group flex h-auto w-full items-center gap-4 rounded-xl border p-4 text-left transition-all hover:shadow-xs',
          isCompleted
            ? 'border-green-500/20 bg-green-500/5 hover:border-green-500/30 hover:bg-green-500/10'
            : 'border-border/60 bg-muted/20 hover:border-border/80 hover:bg-muted/40',
        )}
      >
        {/* Circular progress indicator */}
        <div className="relative size-14 shrink-0">
          <svg className="size-full -rotate-90" viewBox="0 0 64 64">
            <circle cx="32" cy="32" r="26" stroke="currentColor" strokeWidth="5" fill="none" className="text-muted" />
            <circle
              cx="32"
              cy="32"
              r="26"
              stroke="currentColor"
              strokeWidth="5"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={2 * Math.PI * 26}
              strokeDashoffset={
                totalActivities === 0 ? 0 : 2 * Math.PI * 26 * (1 - completedActivities / totalActivities)
              }
              className={cn('transition-all duration-700 ease-out', isCompleted ? 'text-green-500' : 'text-primary')}
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            {isCompleted ? (
              <Trophy className="size-5 text-green-600" />
            ) : (
              <span className="text-foreground text-sm font-bold">{progressPercentage}%</span>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className={cn('text-sm font-medium', isCompleted ? 'text-green-800' : 'text-foreground')}>
              {isCompleted ? t('courseCompleted') : t('courseProgress')}
            </p>
            {isCompleted && (
              <Badge variant="secondary" className="bg-green-100 text-green-700">
                <CheckCircle2 className="mr-1 size-3" />
                {t('completed')}
              </Badge>
            )}
          </div>
          <p className={cn('mt-0.5 text-sm', isCompleted ? 'text-green-600' : 'text-muted-foreground')}>
            {t('completedActivities', { completedActivities, totalActivities })}
          </p>
        </div>

        <ArrowRight
          className={cn(
            'size-5 transition-transform group-hover:translate-x-0.5',
            isCompleted ? 'text-green-500' : 'text-muted-foreground',
          )}
        />
      </Button>
    )
  }

  return (
    <Card size="sm">
      <CardContent className="space-y-4">
        {/* Progress Section */}
        {renderProgressSection()}

        {/* Start/Continue Course Button */}
        <Button onClick={handleCourseAction} disabled={isActionLoading} className="h-12 w-full gap-2 text-base">
          {isActionLoading ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            renderActionButton(!isStarted ? 'start' : !nextUnfinished && certificateHref ? 'certificate' : 'continue')
          )}
        </Button>

        {/* Contributor Button */}
        {renderContributorButton()}

        {/* Course Progress Modal */}
        <CourseProgress
          course={course}
          isOpen={isProgressOpen}
          onClose={() => setIsProgressOpen(false)}
          learnerState={learnerState}
        />
      </CardContent>
    </Card>
  )
}

export default CoursesActions
