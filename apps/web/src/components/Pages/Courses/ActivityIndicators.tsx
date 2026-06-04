'use client'

import {
  Check,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Code2,
  FileArchive,
  FileText,
  Layers,
  Trophy,
  Video,
} from 'lucide-react'
import ToolTip from '@/components/Objects/Elements/Tooltip/Tooltip'
import { getAbsoluteUrl } from '@services/config/config'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import Link from '@components/ui/AppLink'
import { Fragment, useMemo } from 'react'
import { buildCourseActivityIndex, normalizeActivityUuid } from '@/lib/course-activity-index'

interface Props {
  course: AppCourse
  course_uuid: string
  current_activity?: string
  enableNavigation?: boolean
  trailData?: AppTrailData | null | undefined
}

// Helper functions
function getActivityTypeLabel(activityType: string, t: (key: string) => string): string {
  switch (activityType) {
    case 'TYPE_VIDEO': {
      return t('activityTypes.video')
    }
    case 'TYPE_DOCUMENT': {
      return t('activityTypes.document')
    }
    case 'TYPE_DYNAMIC': {
      return t('activityTypes.interactive')
    }
    case 'TYPE_FILE_SUBMISSION': {
      return t('activityTypes.fileSubmission')
    }
    case 'TYPE_EXAM': {
      return t('activityTypes.exam')
    }
    case 'TYPE_CODE_CHALLENGE': {
      return t('activityTypes.codeChallenge')
    }
    default: {
      return t('unknownActivity')
    }
  }
}

function getActivityTypeIconColor(activityType: string): string {
  switch (activityType) {
    case 'TYPE_VIDEO': {
      return 'text-blue-500'
    }
    case 'TYPE_DOCUMENT': {
      return 'text-purple-500'
    }
    case 'TYPE_DYNAMIC': {
      return 'text-emerald-500'
    }
    case 'TYPE_FILE_SUBMISSION': {
      return 'text-indigo-500'
    }
    case 'TYPE_EXAM': {
      return 'text-amber-500'
    }
    case 'TYPE_CODE_CHALLENGE': {
      return 'text-cyan-500'
    }
    default: {
      return 'text-gray-500'
    }
  }
}

const ActivityTypeIcon = ({ activityType, size = 14 }: { activityType: string; size?: number }) => {
  const colorClass = getActivityTypeIconColor(activityType)
  switch (activityType) {
    case 'TYPE_VIDEO': {
      return <Video size={size} className={colorClass} />
    }
    case 'TYPE_DOCUMENT': {
      return <FileText size={size} className={colorClass} />
    }
    case 'TYPE_DYNAMIC': {
      return <Layers size={size} className={colorClass} />
    }
    case 'TYPE_FILE_SUBMISSION': {
      return <FileArchive size={size} className={colorClass} />
    }
    case 'TYPE_EXAM': {
      return <ClipboardList size={size} className={colorClass} />
    }
    case 'TYPE_CODE_CHALLENGE': {
      return <Code2 size={size} className={colorClass} />
    }
    default: {
      return <FileText size={size} className={colorClass} />
    }
  }
}

const ActivityTooltipContent = ({
  activity,
  isDone,
  isCurrent,
}: {
  activity: AppActivity
  isDone: boolean
  isCurrent: boolean
}) => {
  const t = useTranslations('ActivityIndicators')
  return (
    <div className="border-border bg-popover text-popover-foreground min-w-[200px] rounded-lg border p-3 shadow-md">
      <div className="flex items-start gap-2.5">
        <div className="bg-muted flex h-7 w-7 shrink-0 items-center justify-center rounded-md">
          <ActivityTypeIcon activityType={activity.activity_type ?? ''} size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-popover-foreground truncate text-sm font-medium">{activity.name}</p>
          <p className="text-muted-foreground text-xs">{getActivityTypeLabel(activity.activity_type ?? '', t)}</p>
        </div>
      </div>
      <div className="border-border mt-2.5 border-t pt-2.5">
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium ${
            isCurrent || isDone ? 'text-primary' : 'text-muted-foreground'
          }`}
        >
          {isDone && <Check size={11} className="stroke-[2.5]" />}
          {isCurrent ? t('currentActivity') : isDone ? t('completed') : t('notStarted')}
        </span>
      </div>
    </div>
  )
}

const ChapterTooltipContent = ({
  chapter,
  chapterNumber,
  totalActivities,
  completedActivities,
}: {
  chapter: AppChapter
  chapterNumber: number
  totalActivities: number
  completedActivities: number
}) => {
  const t = useTranslations('ActivityIndicators')
  const progress = totalActivities > 0 ? Math.round((completedActivities / totalActivities) * 100) : 0
  const isComplete = totalActivities > 0 && completedActivities === totalActivities

  return (
    <div className="border-border bg-popover text-popover-foreground min-w-[180px] rounded-lg border p-3 shadow-md">
      <div className="flex items-center gap-2.5">
        <div
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold ${
            isComplete ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
          }`}
        >
          {isComplete ? <Check size={13} className="stroke-[2.5]" /> : chapterNumber}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
            {t('chapter')} {chapterNumber}
          </p>
          <p className="text-popover-foreground truncate text-sm font-medium">{chapter.name}</p>
        </div>
      </div>
      <div className="border-border mt-2.5 space-y-1.5 border-t pt-2.5">
        <div className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{t('progress')}</span>
          <span className={`font-medium ${isComplete ? 'text-primary' : 'text-foreground'}`}>
            {completedActivities}/{totalActivities}
          </span>
        </div>
        <div className="bg-muted h-1 w-full overflow-hidden rounded-full">
          <div
            className={`h-full rounded-full transition-all duration-300 ${isComplete ? 'bg-primary' : 'bg-primary/60'}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  )
}

const CertificationBadge = ({ courseid, isCompleted }: { courseid: string; isCompleted: boolean }) => {
  const t = useTranslations('Certificates.ActivityIndicators')
  return (
    <ToolTip
      sideOffset={8}
      unstyled
      content={
        <div className="border-border bg-popover text-popover-foreground min-w-[180px] rounded-lg border p-3 shadow-md">
          <div className="flex items-center gap-2.5">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                isCompleted ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              }`}
            >
              <Trophy size={14} />
            </div>
            <div>
              <p className="text-popover-foreground text-sm font-medium">
                {isCompleted ? t('certificationAvailable') : t('earnCertificate')}
              </p>
              <p className="text-muted-foreground mt-0.5 text-xs">
                {isCompleted ? t('viewCertificate') : t('completeAllActivities')}
              </p>
            </div>
          </div>
        </div>
      }
    >
      <Link
        href={`${getAbsoluteUrl('')}/course/${courseid}/activity/end`}
        className={`ml-1 flex items-center focus:outline-none ${
          isCompleted ? 'opacity-100' : 'pointer-events-none opacity-30'
        }`}
        aria-disabled={!isCompleted}
      >
        <div
          className={`flex h-5 w-5 items-center justify-center rounded-full transition-colors ${
            isCompleted
              ? 'bg-primary text-primary-foreground'
              : 'border-border bg-background text-muted-foreground border'
          }`}
        >
          <Trophy size={10} />
        </div>
      </Link>
    </ToolTip>
  )
}

const ActivityIndicators = (props: Props) => {
  const t = useTranslations('ActivityIndicators')
  const { course } = props
  const courseid = props.course_uuid.replace('course_', '')
  const { enableNavigation } = props
  const router = useRouter()

  // Build activity index for efficient lookups
  const activityIndex = useMemo(() => buildCourseActivityIndex(course.chapters as never), [course.chapters])
  const { allActivities } = activityIndex
  const cleanCurrentActivityId = normalizeActivityUuid(props.current_activity)
  const currentActivityIndex = cleanCurrentActivityId
    ? (activityIndex.indexByCleanUuid.get(cleanCurrentActivityId) ?? -1)
    : -1

  // Memoized set of completed activity IDs for fast lookup
  const completedActivityIds = useMemo(() => {
    const cleanCourseUuid = course.course_uuid?.replace('course_', '')
    const run = props.trailData?.runs?.find((activeRun: AppTrailRun) => {
      const cleanRunCourseUuid = activeRun.course?.course_uuid?.replace('course_', '')
      return cleanRunCourseUuid === cleanCourseUuid
    })
    return new Set(
      (run?.steps ?? [])
        .filter((step: AppTrailStep) => step.complete === true)
        .map((step: AppTrailStep) => Number(step.activity_id)),
    )
  }, [props.trailData, course.course_uuid])

  function isActivityDone(activity: { id?: number | null }) {
    return completedActivityIds.has(Number(activity.id))
  }

  function isActivityCurrent(activity: { cleanUuid?: string }) {
    return activity.cleanUuid === cleanCurrentActivityId
  }

  function navigateToPrevious() {
    if (currentActivityIndex > 0) {
      const prevActivity = allActivities[currentActivityIndex - 1]
      if (prevActivity) {
        router.push(`${getAbsoluteUrl('')}/course/${courseid}/activity/${prevActivity.cleanUuid}`)
      }
    }
  }

  function navigateToNext() {
    if (currentActivityIndex < allActivities.length - 1) {
      const nextActivity = allActivities[currentActivityIndex + 1]
      if (nextActivity) {
        router.push(`${getAbsoluteUrl('')}/course/${courseid}/activity/${nextActivity.cleanUuid}`)
      }
    }
  }

  // Check if all activities are completed
  const totalActivitiesCount = allActivities.length
  const completedActivities = allActivities.filter(activity => isActivityDone(activity)).length
  const isCourseCompleted = totalActivitiesCount > 0 && completedActivities === totalActivitiesCount

  return (
    <div className="flex items-center gap-2">
      {enableNavigation ? (
        <button
          onClick={navigateToPrevious}
          disabled={currentActivityIndex <= 0}
          className="border-border text-muted-foreground hover:bg-muted hover:text-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-30"
          aria-label={t('previousActivity')}
        >
          <ChevronLeft size={16} />
        </button>
      ) : null}

      <div className="flex flex-1 items-center gap-1 overflow-hidden">
        {(course.chapters ?? []).map((chapter: AppChapter, chapterIndex: number) => {
          // Get activities for this chapter from the index
          const chapterActivities = allActivities.filter(a => a.chapterIndex === chapterIndex)
          const completedCount = chapterActivities.reduce(
            (acc, activity) => acc + (isActivityDone(activity) ? 1 : 0),
            0,
          )
          const isChapterComplete = chapterActivities.length > 0 && completedCount === chapterActivities.length
          const firstActivity = chapterActivities[0]
          const chapterLinkHref = firstActivity
            ? `${getAbsoluteUrl('')}/course/${courseid}/activity/${firstActivity.cleanUuid}`
            : undefined

          return (
            <Fragment key={chapter.id}>
              {/* Chapter indicator */}
              <ToolTip
                sideOffset={10}
                unstyled
                content={
                  <ChapterTooltipContent
                    chapter={chapter}
                    chapterNumber={chapterIndex + 1}
                    totalActivities={chapterActivities.length}
                    completedActivities={completedCount}
                  />
                }
              >
                {chapterLinkHref ? (
                  <Link
                    href={chapterLinkHref}
                    className="group flex shrink-0 items-center justify-center focus:outline-none"
                  >
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold transition-colors ${
                        isChapterComplete
                          ? 'bg-primary text-primary-foreground'
                          : 'border-border bg-background text-muted-foreground group-hover:border-muted-foreground/50 border'
                      }`}
                    >
                      {isChapterComplete ? <Check size={11} className="stroke-3" /> : chapterIndex + 1}
                    </div>
                  </Link>
                ) : (
                  <div className="flex shrink-0 items-center justify-center">
                    <div
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-semibold ${
                        isChapterComplete
                          ? 'bg-primary text-primary-foreground'
                          : 'border-border bg-background text-muted-foreground border'
                      }`}
                    >
                      {chapterIndex + 1}
                    </div>
                  </div>
                )}
              </ToolTip>

              <div className="flex flex-1 items-center gap-0.5">
                {chapterActivities.map(activity => {
                  const isDone = isActivityDone(activity)
                  const isCurrent = isActivityCurrent(activity)
                  return (
                    <ToolTip
                      sideOffset={10}
                      unstyled
                      content={
                        <ActivityTooltipContent activity={activity as never} isDone={isDone} isCurrent={isCurrent} />
                      }
                      key={activity.activity_uuid}
                    >
                      <Link
                        href={`${getAbsoluteUrl('')}/course/${courseid}/activity/${activity.cleanUuid}`}
                        className="group relative flex flex-1 py-1.5"
                      >
                        <span
                          className={`block h-2 w-full rounded-full transition-colors duration-150 ${
                            isCurrent
                              ? 'bg-primary'
                              : isDone
                                ? 'bg-primary/70'
                                : 'bg-muted-foreground/20 group-hover:bg-muted-foreground/35'
                          }`}
                        />
                      </Link>
                    </ToolTip>
                  )
                })}
              </div>
            </Fragment>
          )
        })}

        {/* Certification Badge */}
        <CertificationBadge courseid={courseid} isCompleted={isCourseCompleted} />
      </div>

      {enableNavigation ? (
        <button
          onClick={navigateToNext}
          disabled={currentActivityIndex >= allActivities.length - 1}
          className="border-border text-muted-foreground hover:bg-muted hover:text-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-md border transition-colors disabled:cursor-not-allowed disabled:opacity-30"
          aria-label={t('nextActivity')}
        >
          <ChevronRight size={16} className="text-muted-foreground" />
        </button>
      ) : null}
    </div>
  )
}

export default ActivityIndicators
