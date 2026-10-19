import { Link as RouterLink } from '@tanstack/react-router'

import { m } from '#/paraglide/messages'
import { buttonVariants } from '#/shared/components/button-variants'
import { StatusScreen } from '#/shared/components/status-screen'

/** The 403 of a course workspace: the course page and the caller's own courses. */
export function NotOnTeam({ courseId }: { courseId: string }) {
  return (
    <StatusScreen title={m.studio_not_on_team_title()} text={m.studio_not_on_team_text()}>
      <RouterLink to="/courses/$courseId" params={{ courseId }} className={buttonVariants()}>
        {m.studio_not_on_team_page()}
      </RouterLink>
      <RouterLink to="/teach/courses" className={buttonVariants({ variant: 'outline' })}>
        {m.studio_not_on_team_mine()}
      </RouterLink>
    </StatusScreen>
  )
}
