import type { CourseLearner } from '#/shared/api/gen/types.gen'
import { Link } from '#/shared/components/link'
import { UserAvatar } from '#/shared/components/user-avatar'

/** Who the row is: the avatar, the name into their grades, the username and the email under it. */
export function LearnerName({ courseId, learner }: { courseId: string; learner: CourseLearner }) {
  return (
    <span className="flex items-center gap-3">
      <UserAvatar name={learner.display_name || learner.username} avatarKey={learner.avatar_key} />
      <span className="flex min-w-0 flex-col wrap-anywhere">
        {/* Their grades in this course (the gradebook found by username), not the public profile. */}
        <Link
          variant="title"
          to="/teach/courses/$courseId/gradebook"
          params={{ courseId }}
          search={{ q: learner.username }}
        >
          {learner.display_name || learner.username}
        </Link>
        {/* On a card (narrow) the username and the email are a line each: side by side an address broke mid-word. */}
        <span className="flex flex-col text-sm font-normal text-muted-foreground @2xl:flex-row @2xl:flex-wrap @2xl:gap-x-1.5">
          <span>@{learner.username}</span>
          <span aria-hidden className="hidden @2xl:inline">
            ·
          </span>
          <span>{learner.email}</span>
        </span>
      </span>
    </span>
  )
}
