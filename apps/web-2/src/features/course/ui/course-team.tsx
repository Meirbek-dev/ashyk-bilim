import { useSuspenseInfiniteQuery } from '@tanstack/react-query'

import { WriteLink } from '#/features/conversations'
import { m } from '#/paraglide/messages'
import { Link } from '#/shared/components/link'
import { UserAvatar } from '#/shared/components/user-avatar'

import { authorRows } from '../model/course'
import { contributorsOptions } from '../queries'

/**
 * The course's teachers for a signed-in reader, each with «Написать» where the server allows a message
 * (docs/DIALOGS.md 9): a learner of the course writes to its team from here.
 */
export function CourseTeam({ courseId }: { courseId: string }) {
  const { data: roster } = useSuspenseInfiniteQuery(contributorsOptions(courseId))
  const team = authorRows(roster)
  if (team.length === 0) return null
  return (
    <section aria-labelledby="course-team" className="flex flex-col gap-3">
      <h2 id="course-team" className="text-xl font-semibold">
        {m.course_team_title()}
      </h2>
      <ul className="flex flex-col gap-3">
        {team.map(member => (
          <li key={member.user_id} className="flex flex-wrap items-center gap-3">
            <UserAvatar name={member.display_name} avatarKey={member.avatar_key} />
            <Link to="/users/$username" params={{ username: member.username }} variant="title">
              {member.display_name}
            </Link>
            <WriteLink userId={member.user_id} course={courseId} name={member.display_name} variant="ghost" />
          </li>
        ))}
      </ul>
    </section>
  )
}
