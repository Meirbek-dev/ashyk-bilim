'use client'

import { BookOpen, CheckCircle2, Loader2, LogIn } from 'lucide-react'
import { useSession } from '@/hooks/useSession'
import { getUserAvatarMediaDirectory } from '@services/media/media'
import { useTranslations } from 'next-intl'
import type { LearnerCourseState } from '@/features/learner-course/api'
import { useContributors } from '@/features/courses/hooks/useContributors'
import type { Contributor } from '@/lib/api/generated/zod'
import CourseProgress from '../CourseProgress/CourseProgress'
import { CTA_LABEL, ContributorControl, useCourseCta } from './useCourseActions'

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
  const { user: currentUser } = useSession()
  // Same CTA branches and toasts as the desktop sidebar (UX-174/175).
  const { action, hasNoLiveActivities, isActionLoading, handleCourseAction, isProgressOpen, setIsProgressOpen } =
    useCourseCta({ courseuuid, course, trailData, learnerState })

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
            disabled={isActionLoading}
            className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold"
          >
            {isActionLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : !currentUser ? (
              <>
                <LogIn className="h-4 w-4" />
                {t('signIn')}
              </>
            ) : (
              <>
                {action === 'start' ? (
                  <LogIn className="h-4 w-4" />
                ) : action === 'continue' || action === 'preview' ? (
                  <BookOpen className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {tActions(CTA_LABEL[action])}
              </>
            )}
          </Button>
        )}

        {/* UX-176: the phone landing is the only one below md — apply/withdraw lives here too. */}
        <ContributorControl courseuuid={courseuuid} course={course} />
      </div>
      <CourseProgress
        course={course}
        isOpen={isProgressOpen}
        onClose={() => setIsProgressOpen(false)}
        learnerState={learnerState}
      />
    </div>
  )
}

export default CourseActionsMobile
