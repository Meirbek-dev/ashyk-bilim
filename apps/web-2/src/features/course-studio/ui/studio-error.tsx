import { type ErrorComponentProps, Link as RouterLink, useParams } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'

import { ErrorView } from '#/features/platform'
import { m } from '#/paraglide/messages'
import { ApiError } from '#/shared/api/errors'
import { buttonVariants } from '#/shared/components/button-variants'
import { FocusPage } from '#/shared/components/templates/focus-page'

import { ArchivedCourse } from './archived-course'
import { NotOnTeam } from './not-on-team'

/**
 * The activity studio (and its review screen) refused or failed: it draws the focus layout itself, so the error
 * keeps that frame - a way back to the course and the page's gutter - instead of a bare screen at the window's edge.
 * A 403 is someone outside the course team (B-CST-12): the course page and their own courses, as in the workspace;
 * on an archived course it is its team: the way to restore it, or who can.
 */
export function StudioError(props: ErrorComponentProps) {
  const { courseId } = useParams({ strict: false })
  const forbidden = props.error instanceof ApiError && props.error.status === 403
  const archived = forbidden && props.error instanceof ApiError && props.error.code === 'course-archived'
  const outsider = forbidden && !archived
  const back = courseId ? (
    <RouterLink
      to={outsider ? '/courses/$courseId' : '/teach/courses/$courseId/content'}
      params={{ courseId }}
      className={buttonVariants({ variant: 'ghost' })}
    >
      <ArrowLeft aria-hidden />
      {m.platform_back_to_course()}
    </RouterLink>
  ) : null
  const title = archived ? m.studio_archived_activity_title() : outsider ? m.studio_not_on_team_title() : null
  return (
    <FocusPage back={back} title={title ?? m.platform_error_title()}>
      {archived && courseId ? (
        <ArchivedCourse courseId={courseId} />
      ) : outsider && courseId ? (
        <NotOnTeam courseId={courseId} />
      ) : (
        <ErrorView {...props} />
      )}
    </FocusPage>
  )
}
