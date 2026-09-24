import { ArrowRight, BookOpen, CheckCircle2, PlayCircle, Trophy, Loader2 } from 'lucide-react'
import { useSession } from '@/hooks/useSession'
import CourseProgress from '../CourseProgress/CourseProgress'
import { Card, CardContent } from '@/components/ui/card'
import UserAvatar from '@components/Objects/UserAvatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'
import { learnerCourseProgress } from '@/features/learner-course/api'
import type { LearnerCourseState } from '@/features/learner-course/api'
import { CTA_LABEL, ContributorControl, useCourseCta } from './useCourseActions'
import type { CourseCta } from './useCourseActions'

interface CourseActionsProps {
  courseuuid: string
  course: AppCourse
  trailData?: AppTrailData | null | undefined
  /** Single progress source (published activities only) — same data as the activity sidebar. */
  learnerState?: LearnerCourseState | null | undefined
}

function CoursesActions({ courseuuid, course, trailData, learnerState }: CourseActionsProps) {
  const { user: currentUser } = useSession()
  const t = useTranslations('Courses.CoursesActions')
  const {
    action,
    isStarted,
    hasNoLiveActivities,
    isActionLoading,
    handleCourseAction,
    isProgressOpen,
    setIsProgressOpen,
  } = useCourseCta({ courseuuid, course, trailData, learnerState })

  const renderActionButton = (action: CourseCta) => {
    const isAuthenticated = Boolean(currentUser)
    const icon =
      action === 'start' ? (
        <PlayCircle className="size-5" />
      ) : action === 'certificate' || action === 'review' ? (
        <CheckCircle2 className="size-5" />
      ) : (
        <ArrowRight className="size-5" />
      )
    const label = t(CTA_LABEL[action])

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

  const renderProgressSection = () => {
    const {
      completed: completedActivities,
      total: totalActivities,
      percent: progressPercentage,
    } = learnerCourseProgress(learnerState)
    const isCompleted = totalActivities > 0 && progressPercentage === 100

    if (hasNoLiveActivities) {
      return (
        <div className="border-border/60 bg-muted/20 flex items-center gap-4 rounded-xl border p-4">
          <div className="bg-muted flex size-14 shrink-0 items-center justify-center rounded-full">
            <BookOpen className="text-muted-foreground size-6" />
          </div>
          <p className="text-muted-foreground text-sm">{t('noPublishedActivities')}</p>
        </div>
      )
    }

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
        {hasNoLiveActivities ? null : (
          <Button onClick={handleCourseAction} disabled={isActionLoading} className="h-12 w-full gap-2 text-base">
            {isActionLoading ? <Loader2 className="size-5 animate-spin" /> : renderActionButton(action)}
          </Button>
        )}

        {/* Contributor Button */}
        <ContributorControl courseuuid={courseuuid} course={course} />

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
