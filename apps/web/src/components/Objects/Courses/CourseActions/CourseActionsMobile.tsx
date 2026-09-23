'use client'

import { BookOpen, Loader2, LogIn } from 'lucide-react'
import { useSession } from '@/hooks/useSession'
import { getUserAvatarMediaDirectory } from '@services/media/media'
import { useState, useTransition } from 'react'
import { revalidateTags } from '@/lib/cache/revalidate'
import { startCourse } from '@services/courses/activity'
import { getAbsoluteUrl } from '@services/config/config'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import {
  learnerCourseProgress,
  learnerCourseStateQueryOptions,
  type LearnerCourseState,
} from '@/features/learner-course/api'
import { queryKeys } from '@/lib/react-query/queryKeys'
import { buildLoginRedirect } from '@/lib/auth/redirect'
import { useContributors } from '@/features/courses/hooks/useContributors'
import type { Contributor } from '@/lib/api/generated/zod'

import { Button } from '@/components/ui/button'
import UserAvatar from '../../UserAvatar'

const ROLE_PRIORITY: Record<string, number> = { creator: 0, maintainer: 1, contributor: 2, reporter: 3 }

interface CourseActionsMobileProps {
  courseuuid: string
  course: AppCourse
  trailData?: AppTrailData | null | undefined
  learnerState?: LearnerCourseState | null | undefined
}

// Component for displaying multiple authors
/** Active roster rows (`GET /courses/{id}/contributors`) — the v2 `Course` carries no author profiles (BUG-248). */
function MultipleAuthors({ authors }: { authors: Contributor[] }) {
  const t = useTranslations('Courses.CourseActionsMobile')

  const displayedAvatars = authors.slice(0, 3)
  const remainingCount = Math.max(0, authors.length - 3)

  // Avatar size for mobile
  const avatarSize = 36

  return (
    <div className="flex items-center gap-3">
      <div className="relative flex -space-x-3">
        {displayedAvatars.map((author, index) => (
          <div key={author.user_id} className="relative" style={{ zIndex: displayedAvatars.length - index }}>
            <UserAvatar
              size="sm"
              variant="outline"
              avatar_url={author.avatar_key ? getUserAvatarMediaDirectory(author.user_id, author.avatar_key) : ''}
              {...(author.avatar_key ? {} : { predefined_avatar: 'empty' })}
            />
          </div>
        ))}
        {remainingCount > 0 && (
          <div className="relative z-0">
            <div
              className="border-card bg-muted text-muted-foreground flex items-center justify-center rounded-full border-2 text-xs font-medium shadow-sm"
              style={{
                width: `${avatarSize}px`,
                height: `${avatarSize}px`,
              }}
            >
              +{remainingCount}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-col">
        <span className="text-muted-foreground text-xs font-medium">
          {authors.length > 1 ? t('authors') : t('author')}
        </span>
        <span className="text-foreground text-sm font-semibold">
          {authors[0]?.display_name || `@${authors[0]?.username || t('unknownAuthor')}`}
          {authors.length > 1 && ` ${t('moreAuthors', { count: authors.length - 1 })}`}
        </span>
      </div>
    </div>
  )
}

function CourseActionsMobile({ courseuuid, course, trailData, learnerState }: CourseActionsMobileProps) {
  const t = useTranslations('Courses.CourseActionsMobile')
  const tActions = useTranslations('Courses.CoursesActions')
  const router = useRouter()
  const queryClient = useQueryClient()
  const { user: currentUser } = useSession()
  const [isActionLoading, setIsActionLoading] = useState(false)
  const [isPending, startTransition] = useTransition()

  // Clean up course UUID by removing 'course_' prefix if it exists
  const cleanCourseUuid = course.course_uuid?.replace('course_', '')

  const hasTrailRun = Boolean(
    trailData?.runs?.find((run: AppTrailRun) => {
      const cleanRunCourseUuid = run.course?.course_uuid?.replace('course_', '')
      return cleanRunCourseUuid === cleanCourseUuid
    }),
  )
  // Same rule as CoursesActions: the wire's `enrolled` wins over the trail run.
  const isStarted = learnerState?.enrolled ?? hasTrailRun
  // UX-119: nothing published for learners (0/0) — no CTA to dead-click.
  const hasNoLiveActivities =
    learnerState !== null && learnerState !== undefined && learnerCourseProgress(learnerState).total === 0

  // UX-119: same as CoursesActions — Back within the learner-state
  // staleTime must show the enrolled landing.
  const refreshEnrolment = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.trail.current() }),
      queryClient.invalidateQueries({ queryKey: learnerCourseStateQueryOptions(courseuuid).queryKey }),
    ])

  const handleCourseAction = async () => {
    if (!currentUser) {
      router.push(buildLoginRedirect(`/course/${courseuuid}`))
      return
    }

    // If already started, navigate to first unfinished activity
    if (isStarted) {
      if (!hasTrailRun) {
        await startCourse(`course_${courseuuid}`).catch(() => undefined)
        await Promise.all([revalidateTags(['courses']), refreshEnrolment()])
      }
      const { completedIds } = learnerCourseProgress(learnerState)
      const firstUnfinishedActivity = course.chapters
        ?.flatMap(chapter => chapter.activities ?? [])
        .find(activity => !completedIds.has(activity.activity_uuid.replace('activity_', '')))

      // If all activities are completed, go to first activity
      const targetActivity = firstUnfinishedActivity || course.chapters?.[0]?.activities?.[0]

      if (targetActivity?.activity_uuid) {
        router.push(
          `${getAbsoluteUrl('')}/course/${courseuuid}/activity/${targetActivity.activity_uuid.replace('activity_', '')}`,
        )
      }
      return
    }

    startTransition(() => setIsActionLoading(true))
    try {
      await startCourse(`course_${courseuuid}`)
      await Promise.all([revalidateTags(['courses']), refreshEnrolment()])

      // Get the first activity from the first chapter
      const firstChapter = course.chapters?.[0]
      const firstActivity = firstChapter?.activities?.[0]

      if (firstActivity) {
        // Redirect to the first activity
        await revalidateTags(['activities'])
        router.push(
          `${getAbsoluteUrl('')}/course/${courseuuid}/activity/${firstActivity.activity_uuid.replace('activity_', '')}`,
        )
      } else {
        router.refresh()
      }
    } catch (error) {
      console.error('Failed to perform course action:', error)
    } finally {
      startTransition(() => setIsActionLoading(false))
      await revalidateTags(['courses'])
    }
  }

  // The roster is a signed-in read (anonymous → 401), like CourseAuthors.
  const { data: roster } = useContributors(courseuuid, { enabled: Boolean(currentUser) })
  const sortedAuthors = (roster ?? [])
    .filter(row => row.status === 'active')
    .toSorted((a, b) => (ROLE_PRIORITY[a.role] ?? 999) - (ROLE_PRIORITY[b.role] ?? 999))

  return (
    <div className="border-border/80 bg-card overflow-hidden rounded-xl border p-4 shadow-xs">
      <div className="flex flex-col space-y-4">
        {sortedAuthors.length > 0 && <MultipleAuthors authors={sortedAuthors} />}

        {hasNoLiveActivities ? (
          <p className="text-muted-foreground text-sm">{t('noPublishedActivities')}</p>
        ) : (
          <Button
            type="button"
            onClick={handleCourseAction}
            disabled={isActionLoading || isPending}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
          >
            {isActionLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : !currentUser ? (
              <>
                <LogIn className="h-4 w-4" />
                {t('signIn')}
              </>
            ) : isStarted ? (
              <>
                <BookOpen className="h-4 w-4" />
                {tActions('continueLearning')}
              </>
            ) : (
              <>
                <LogIn className="h-4 w-4" />
                {t('startCourse')}
              </>
            )}
          </Button>
        )}
      </div>
    </div>
  )
}

export default CourseActionsMobile
